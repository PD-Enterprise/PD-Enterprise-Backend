import Groq from "groq-sdk";
import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";
import { ChatMessage, InferenceProvider, StreamChunk } from "./types";
import webSearch, {
  WEB_SEARCH_TOOL,
  WebSearchResult,
  formatSearchResults,
  parseQuery,
} from "../../utils/webSearch";

const TOOL_USE_FAILED_CODE = "tool_use_failed";

interface ToolCallAccumulator {
  index: number;
  id?: string;
  name?: string;
  arguments?: string;
}

function isToolUseFailure(err: any): boolean {
  return (
    !!err &&
    (err?.error?.code === TOOL_USE_FAILED_CODE ||
      (typeof err?.message === "string" &&
        err.message.includes("Failed to call a function")))
  );
}

function errorMessage(err: any): string {
  if (typeof err?.message === "string" && err.message.trim()) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return "The model failed to generate a response. Please try again.";
}

export class GroqProvider implements InferenceProvider {
  private client: Groq;
  private tavilyApiKey: string;

  constructor(apiKey: string, tavilyApiKey: string) {
    if (!apiKey) {
      throw new Error("The GROQ_API_KEY is missing or empty.");
    }
    this.client = new Groq({ apiKey });
    this.tavilyApiKey = tavilyApiKey;
  }

  async *stream(
    messages: ChatMessage[],
    model: string,
  ): AsyncIterable<StreamChunk> {
    const params: ChatCompletionMessageParam[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    console.log("[groqProvider.stream] starting", { model, messageCount: params.length });

    let firstResponse: any;
    try {
      firstResponse = await this.client.chat.completions.create({
        model,
        messages: params,
        stream: true,
        tools: [WEB_SEARCH_TOOL],
        tool_choice: "auto",
      });
    } catch (err: any) {
      console.error("[groqProvider.stream] failed to start tool completion", {
        model,
        error: err?.message,
      });
      yield { type: "error", message: errorMessage(err) };
      return;
    }

    const toolCalls: ToolCallAccumulator[] = [];
    let firstUsage: StreamChunk["usage"] | undefined;
    let textBuffer = "";
    let thinkingBuffer = "";
    let toolCallFailed = false;
    let toolCallError = "";

    try {
      for await (const chunk of firstResponse) {
        const delta = chunk.choices[0]?.delta;

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            toolCalls[tc.index] = toolCalls[tc.index] ?? { index: tc.index };
            if (tc.id) toolCalls[tc.index].id = tc.id;
            if (tc.function?.name) toolCalls[tc.index].name = tc.function.name;
            if (tc.function?.arguments) {
              toolCalls[tc.index].arguments =
                (toolCalls[tc.index].arguments ?? "") + tc.function.arguments;
            }
          }
          continue;
        }

        const reasoning = delta?.reasoning ?? (delta as any)?.reasoning_content;
        if (reasoning) {
          thinkingBuffer += reasoning;

          if (thinkingBuffer.length > 20) {
            yield { type: "thinking", thinking: thinkingBuffer };
            thinkingBuffer = "";
          }
        }

        const content = delta?.content;
        if (content) {
          textBuffer += content;

          if (textBuffer.length > 20) {
            yield { type: "delta", delta: textBuffer };
            textBuffer = "";
          }
        }

        if (chunk.x_groq?.usage) {
          const u = chunk.x_groq.usage;
          firstUsage = {
            promptTokens: u.prompt_tokens,
            completionTokens: u.completion_tokens,
            totalTokens: u.total_tokens,
          };
        }
      }
    } catch (err: any) {
      if (isToolUseFailure(err)) {
        toolCallFailed = true;
        toolCallError = errorMessage(err);
        console.error(
          "[groqProvider.stream] Groq rejected the generated function call; retrying without tools",
          {
            model,
            error: err?.message,
            failedGeneration: err?.error?.failed_generation,
          },
        );
      } else {
        console.error("[groqProvider.stream] streaming error from Groq", {
          model,
          error: err?.message,
        });
        yield { type: "error", message: errorMessage(err) };
        return;
      }
    }

    if (toolCallFailed) {
      yield { type: "tool", tool: { name: "web_search", status: "failed" } };
      yield { type: "error", message: toolCallError, recoverable: true };
      yield* this.streamPlain(params, model);
      return;
    }

    if (thinkingBuffer.length > 0) {
      yield { type: "thinking", thinking: thinkingBuffer };
      thinkingBuffer = "";
    }

    if (textBuffer.length > 0) {
      yield { type: "delta", delta: textBuffer };
      textBuffer = "";
    }

    if (toolCalls.length === 0) {
      if (firstUsage) {
        yield { type: "usage", usage: firstUsage };
      }
      console.log("[groqProvider.stream] completed without tool calls", { model });
      return;
    }

    console.log("[groqProvider.stream] received tool calls", {
      model,
      toolCalls: toolCalls.map((tc) => ({ id: tc.id, name: tc.name })),
    });

    const actionableToolCalls = toolCalls.filter(
      (tc): tc is ToolCallAccumulator & { id: string; name: string } =>
        !!tc.id && tc.name === "web_search",
    );

    if (actionableToolCalls.length === 0) {
      console.warn("[groqProvider.stream] no actionable tool calls", {
        toolCalls,
      });
      if (firstUsage) {
        yield { type: "usage", usage: firstUsage };
      }
      return;
    }

    params.push({
      role: "assistant",
      content: null,
      tool_calls: actionableToolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.arguments ?? "" },
      })),
    });

    for (const toolCall of actionableToolCalls) {
      const query = parseQuery(toolCall.arguments);

      let results: WebSearchResult[] = [];
      if (query) {
        try {
          yield {
            type: "tool",
            tool: { name: "web_search", status: "executing" },
          };
          results = await webSearch(query, this.tavilyApiKey);
          console.log("[groqProvider.stream] web search completed", {
            query,
            resultCount: results.length,
          });
        } catch (err: any) {
          console.error("[groqProvider.stream] web search failed:", err);
        }
      } else {
        console.warn("[groqProvider.stream] unparseable tool call arguments", {
          arguments: toolCall.arguments,
        });
      }

      yield {
        type: "tool",
        tool: { name: "web_search", status: "completed" },
      };

      params.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: query
          ? formatSearchResults(results)
          : "No valid search query was found. Summarize what you know and ask the user to clarify.",
      });
    }

    let finalResponse: any;
    try {
      finalResponse = await this.client.chat.completions.create({
        model,
        messages: params,
        stream: true,
      });
    } catch (err: any) {
      console.error("[groqProvider.stream] failed to start final completion", {
        model,
        error: err?.message,
      });
      yield { type: "error", message: errorMessage(err) };
      return;
    }

    textBuffer = "";
    thinkingBuffer = "";

    try {
      for await (const chunk of finalResponse) {
        const delta = chunk.choices[0]?.delta;

        const reasoning = delta?.reasoning ?? (delta as any)?.reasoning_content;
        if (reasoning) {
          thinkingBuffer += reasoning;

          if (thinkingBuffer.length > 20) {
            yield { type: "thinking", thinking: thinkingBuffer };
            thinkingBuffer = "";
          }
        }

        const content = delta?.content;
        if (content) {
          textBuffer += content;

          if (textBuffer.length > 20) {
            yield { type: "delta", delta: textBuffer };
            textBuffer = "";
          }
        }

        if (chunk.x_groq?.usage) {
          const u = chunk.x_groq.usage;
          yield {
            type: "usage",
            usage: {
              promptTokens: u.prompt_tokens,
              completionTokens: u.completion_tokens,
              totalTokens: u.total_tokens,
            },
          };
        }
      }
    } catch (err: any) {
      console.error("[groqProvider.stream] final completion failed", {
        model,
        error: err?.message,
      });
      yield { type: "error", message: errorMessage(err) };
      return;
    }

    if (thinkingBuffer.length > 0) {
      yield { type: "thinking", thinking: thinkingBuffer };
    }

    if (textBuffer.length > 0) {
      yield { type: "delta", delta: textBuffer };
    }
  }

  private async *streamPlain(
    params: ChatCompletionMessageParam[],
    model: string,
  ): AsyncIterable<StreamChunk> {
    let response: any;
    try {
      response = await this.client.chat.completions.create({
        model,
        messages: params,
        stream: true,
      });
    } catch (err: any) {
      console.error("[groqProvider.stream] fallback completion failed to start", {
        model,
        error: err?.message,
      });
      yield { type: "error", message: errorMessage(err) };
      return;
    }

    let textBuffer = "";
    let thinkingBuffer = "";

    try {
      for await (const chunk of response) {
        const delta = chunk.choices[0]?.delta;

        const reasoning = delta?.reasoning ?? (delta as any)?.reasoning_content;
        if (reasoning) {
          thinkingBuffer += reasoning;

          if (thinkingBuffer.length > 20) {
            yield { type: "thinking", thinking: thinkingBuffer };
            thinkingBuffer = "";
          }
        }

        const content = delta?.content;
        if (content) {
          textBuffer += content;

          if (textBuffer.length > 20) {
            yield { type: "delta", delta: textBuffer };
            textBuffer = "";
          }
        }

        if (chunk.x_groq?.usage) {
          const u = chunk.x_groq.usage;
          yield {
            type: "usage",
            usage: {
              promptTokens: u.prompt_tokens,
              completionTokens: u.completion_tokens,
              totalTokens: u.total_tokens,
            },
          };
        }
      }
    } catch (err: any) {
      console.error("[groqProvider.stream] fallback completion failed", {
        model,
        error: err?.message,
      });
      yield { type: "error", message: errorMessage(err) };
      return;
    }

    if (thinkingBuffer.length > 0) {
      yield { type: "thinking", thinking: thinkingBuffer };
    }

    if (textBuffer.length > 0) {
      yield { type: "delta", delta: textBuffer };
    }
  }
}
