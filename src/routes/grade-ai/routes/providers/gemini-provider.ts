import { Content, GoogleGenAI } from "@google/genai";
import { ChatMessage, InferenceProvider, StreamChunk } from "./types";
import { RESPONSE_TRUNCATED_MESSAGE } from "./types";
import {
  toUserFacingError,
  webSearchUnavailableMessage,
  webSearchUnparseableMessage,
} from "@/src/utils/sanitizeError";
import webSearch, {
  extractImageQueries,
  formatImagesAsMarkdown,
  IMAGE_SEARCH_TOOL_NAME,
} from "../../utils/webSearch";

const GOOGLE_SEARCH_TOOL_NAME = "google_search";
// Maximum image queries honored per reply, as a cost bound in case the
// model emits more markers than expected.
const MAX_IMAGE_QUERIES = 3;
// Upper bound on completion tokens per request — matches the Groq provider.
// The model is instructed (system prompt) to keep replies complete within
// this budget; a "warning" chunk is yielded when the cap cuts a reply off
// (finishReason "MAX_TOKENS") so the UI can say so instead of silently
// truncating.
const MAX_OUTPUT_TOKENS = 2048;

function toolErrorMessage(err: any): string {
  return toUserFacingError(err, "web_search");
}

export class GeminiProvider implements InferenceProvider {
  private client: GoogleGenAI;
  private tavilyApiKey: string;

  constructor(apiKey: string, tavilyApiKey: string = "") {
    if (!apiKey) {
      throw new Error("The GEMINI_API_KEY is missing or empty.");
    }
    this.client = new GoogleGenAI({ apiKey });
    this.tavilyApiKey = tavilyApiKey;
  }

  async *stream(
    messages: ChatMessage[],
    model: string,
  ): AsyncIterable<StreamChunk> {
    const systemMessage = messages.find((m) => m.role === "system");
    const conversationMessages = messages.filter((m) => m.role !== "system");

    if (conversationMessages.length === 0) {
      yield {
        type: "error",
        message: "No message to respond to. Please send a message and try again.",
      };
      return;
    }

    const contents: Content[] = conversationMessages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    console.log("[geminiProvider.stream] starting", {
      model,
      messageCount: contents.length,
    });

    // NOTE: googleSearch is the only tool on this request. The Gemini API
    // rejects requests that combine built-in tools with function calling
    // (400 INVALID_ARGUMENT on gemini-2.5 models), so image lookup uses a
    // `[[IMAGE_SEARCH: query]]` marker the model emits in-band; the provider
    // below strips it and runs Tavily directly. Exactly one model request
    // per turn in the common (no images) case.
    let stream: AsyncGenerator<any>;
    try {
      stream = await this.client.models.generateContentStream({
        model,
        contents,
        config: {
          systemInstruction: systemMessage?.content,
          tools: [{ googleSearch: {} }],
          // Same output cap as the Groq provider — bounds cost per request.
          maxOutputTokens: MAX_OUTPUT_TOKENS,
        },
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
    let googleSearchNotified = false;
    let googleSearchUsed = false;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let truncated = false;
    const imageQueries: string[] = [];

    // Yield user-visible text while holding back any tail that could be a
    // partially-streamed image marker, so protocol syntax never leaks and
    // normal text (including `[1]`-style citations) still streams instantly.
    const flushText = function* (): Iterable<StreamChunk> {
      if (thinkingBuffer.length > 0) {
        yield { type: "thinking", thinking: thinkingBuffer };
        thinkingBuffer = "";
      }
      const { queries, visible, holdback } = extractImageQueries(buffer);
      for (const q of queries) {
        if (imageQueries.length < MAX_IMAGE_QUERIES) imageQueries.push(q);
      }
      buffer = holdback;
      if (visible.length > 0) {
        yield { type: "delta", delta: visible };
      }
    };

    try {
      for await (const chunk of stream) {
        const candidate = chunk.candidates?.[0] as any;
        if (candidate?.finishReason === "MAX_TOKENS") {
          truncated = true;
        }
        const parts = candidate?.content?.parts ?? [];

        for (const part of parts) {
          if (part.thought && part.text) {
            thinkingBuffer += part.text;
            if (thinkingBuffer.length > 20) {
              yield { type: "thinking", thinking: thinkingBuffer };
              thinkingBuffer = "";
            }
          } else if (part.text) {
            buffer += part.text;
            if (buffer.length > 20) {
    yield* flushText();

    if (truncated) {
      yield { type: "warning", message: RESPONSE_TRUNCATED_MESSAGE };
    }
            }
          }
        }

        if (
          !googleSearchNotified &&
          chunk.candidates?.[0]?.groundingMetadata?.webSearchQueries?.length
        ) {
          googleSearchUsed = true;
          googleSearchNotified = true;
          yield {
            type: "tool",
            tool: { name: GOOGLE_SEARCH_TOOL_NAME, status: "executing" },
          };
        }

        if (chunk.usageMetadata) {
          totalPromptTokens =
            chunk.usageMetadata.promptTokenCount ?? totalPromptTokens;
          totalCompletionTokens =
            chunk.usageMetadata.candidatesTokenCount ?? totalCompletionTokens;
        }
      }
    } catch (err) {
      console.error("[geminiProvider.stream] streaming failed", {
        model,
        error: (err as any)?.message ?? err,
      });
      if (googleSearchNotified) {
        yield {
          type: "tool",
          tool: { name: GOOGLE_SEARCH_TOOL_NAME, status: "failed" },
        };
      }
      yield {
        type: "error",
        message: toUserFacingError(
          err,
          googleSearchNotified ? "tool" : "inference",
        ),
      };
      return;
    }

    if (googleSearchUsed) {
      yield {
        type: "tool",
        tool: { name: GOOGLE_SEARCH_TOOL_NAME, status: "completed" },
      };
    }

    yield* flushText();

    // Phase 2 (only when the model asked for images): run Tavily for each
    // collected query and append provider-formatted verified-image markdown.
    // No second model call is needed — the query already came from the model.
    for (const query of imageQueries) {
      if (!query.trim()) {
        console.warn("[geminiProvider.stream] empty image_search query");
        yield {
          type: "tool",
          tool: { name: IMAGE_SEARCH_TOOL_NAME, status: "failed" },
        };
        yield {
          type: "error",
          message: webSearchUnparseableMessage(),
          recoverable: true,
        };
        continue;
      }

      try {
        yield {
          type: "tool",
          tool: { name: IMAGE_SEARCH_TOOL_NAME, status: "executing" },
        };
        const search = await webSearch(query, this.tavilyApiKey);
        console.log("[geminiProvider.stream] image search completed", {
          query,
          resultCount: search.results.length,
          imageCount: search.images.length,
        });
        yield {
          type: "tool",
          tool: { name: IMAGE_SEARCH_TOOL_NAME, status: "completed" },
        };
        const markdown = formatImagesAsMarkdown(search.images);
        if (markdown) {
          yield { type: "delta", delta: markdown };
        }
      } catch (err: any) {
        console.error("[geminiProvider.stream] image search failed:", err);
        yield {
          type: "tool",
          tool: { name: IMAGE_SEARCH_TOOL_NAME, status: "failed" },
        };
        yield {
          type: "error",
          message: toolErrorMessage(err) || webSearchUnavailableMessage(),
          recoverable: true,
        };
      }
    }

    yield {
      type: "usage",
      usage: {
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        totalTokens: totalPromptTokens + totalCompletionTokens,
      },
    };

    console.log("[geminiProvider.stream] completed", {
      model,
      googleSearchUsed,
      imageQueryCount: imageQueries.length,
    });
  }
}
