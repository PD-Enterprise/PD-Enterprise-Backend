import { Content, GoogleGenAI } from "@google/genai";
import { ChatMessage, InferenceProvider, StreamChunk } from "./types";
import { toUserFacingError } from "@/src/utils/sanitizeError";

export class GeminiProvider implements InferenceProvider {
  private client: GoogleGenAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async *stream(
    messages: ChatMessage[],
    model: string,
  ): AsyncIterable<StreamChunk> {
    const systemMessage = messages.find((m) => m.role === "system");
    const conversationMessages = messages.filter((m) => m.role !== "system");

    const history: Content[] = conversationMessages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const lastMessage = conversationMessages.at(-1);
    if (!lastMessage) {
      yield {
        type: "error",
        message: "No message to respond to. Please send a message and try again.",
      };
      return;
    }

    let chat: any;
    try {
      chat = this.client.chats.create({
        model,
        history,
        config: {
          systemInstruction: systemMessage?.content,
          tools: [{ googleSearch: {} }],
        },
      });
    } catch (err) {
      console.error("[geminiProvider.stream] failed to create chat", {
        model,
        error: (err as any)?.message ?? err,
      });
      yield { type: "error", message: toUserFacingError(err, "inference") };
      return;
    }

    let result: AsyncIterable<any>;
    try {
      result = await chat.sendMessageStream({
        message: lastMessage.content,
      });
    } catch (err) {
      console.error("[geminiProvider.stream] failed to start stream", {
        model,
        error: (err as any)?.message ?? err,
      });
      yield { type: "error", message: toUserFacingError(err, "inference") };
      return;
    }

    let buffer = "";
    let thinkingBuffer = "";
    let toolNotified = false;
    let toolName = "google_search";
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;

    try {
      for await (const chunk of result) {
        const parts = chunk.candidates?.[0]?.content?.parts ?? [];

        for (const part of parts) {
          if (part.thought && part.text) {
            thinkingBuffer += part.text;

            if (thinkingBuffer.length > 20) {
              yield { type: "thinking", thinking: thinkingBuffer };
              thinkingBuffer = "";
            }
          } else if (part.functionCall) {
            toolName = part.functionCall.name ?? "function_call";
            if (!toolNotified) {
              yield {
                type: "tool",
                tool: {
                  name: toolName,
                  status: "executing",
                },
              };
              toolNotified = true;
            }
          } else if (part.text) {
            buffer += part.text;

            if (buffer.length > 20) {
              yield { type: "delta", delta: buffer };
              buffer = "";
            }
          }
        }

        if (
          !toolNotified &&
          chunk.candidates?.[0]?.groundingMetadata?.webSearchQueries?.length
        ) {
          yield {
            type: "tool",
            tool: { name: "google_search", status: "executing" },
          };
          toolNotified = true;
        }

        if (chunk.usageMetadata) {
          totalPromptTokens = chunk.usageMetadata.promptTokenCount ?? 0;
          totalCompletionTokens = chunk.usageMetadata.candidatesTokenCount ?? 0;
        }
      }
    } catch (err) {
      console.error("[geminiProvider.stream] streaming failed", {
        model,
        error: (err as any)?.message ?? err,
      });
      if (toolNotified) {
        yield {
          type: "tool",
          tool: { name: toolName, status: "failed" },
        };
      }
      yield {
        type: "error",
        message: toUserFacingError(err, toolNotified ? "tool" : "inference"),
      };
      return;
    }

    if (toolNotified) {
      yield {
        type: "tool",
        tool: { name: toolName, status: "completed" },
      };
    }

    if (thinkingBuffer.length > 0) {
      yield { type: "thinking", thinking: thinkingBuffer };
    }

    if (buffer.length > 0) {
      yield { type: "delta", delta: buffer };
    }

    yield {
      type: "usage",
      usage: {
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        totalTokens: totalPromptTokens + totalCompletionTokens,
      },
    };
  }
}
