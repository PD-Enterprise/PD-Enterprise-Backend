import Groq from "groq-sdk";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "groq-sdk/resources/chat/completions";
import { ChatMessage, InferenceProvider, StreamChunk } from "./types";
import webSearch from "../../utils/webSearch";

const WEB_SEARCH_TOOL: ChatCompletionTool = {
  type: "function",
  function: {
    name: "web_search",
    description:
      "Search the web for current, factual, or verifiable information. Use it when the question depends on recent events, statistics, definitions, or specific facts you are unsure about.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query to look up on the web.",
        },
      },
      required: ["query"],
    },
  },
};

interface ToolCallAccumulator {
  index: number;
  id?: string;
  name?: string;
  arguments?: string;
}

interface SearchResult {
  title: string;
  url: string;
  content: string;
}

function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) {
    return "No relevant web results were found for the query.";
  }
  return results
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.content}`)
    .join("\n\n");
}

function parseQuery(argumentsString?: string): string | null {
  if (!argumentsString) return null;
  try {
    const parsed = JSON.parse(argumentsString);
    return typeof parsed.query === "string" && parsed.query.trim()
      ? parsed.query
      : null;
  } catch {
    return null;
  }
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

    const firstResponse = await this.client.chat.completions.create({
      model,
      messages: params,
      stream: true,
      tools: [WEB_SEARCH_TOOL],
    });

    const toolCalls: ToolCallAccumulator[] = [];
    let firstUsage: StreamChunk["usage"] | undefined;
    let textBuffer = "";
    let thinkingBuffer = "";

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

      let results: SearchResult[] = [];
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

    const finalResponse = await this.client.chat.completions.create({
      model,
      messages: params,
      stream: true,
    });

    textBuffer = "";
    thinkingBuffer = "";

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

    if (thinkingBuffer.length > 0) {
      yield { type: "thinking", thinking: thinkingBuffer };
    }

    if (textBuffer.length > 0) {
      yield { type: "delta", delta: textBuffer };
    }
  }
}
