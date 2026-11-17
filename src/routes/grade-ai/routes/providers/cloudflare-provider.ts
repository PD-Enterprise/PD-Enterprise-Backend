import { createAI } from "agents/models/ai-sdk";
import { streamText, tool } from "ai";
import { z } from "zod";
import {
  toUserFacingError,
  webSearchUnparseableMessage,
} from "@/src/utils/sanitizeError";
import type { ChatMessage, InferenceProvider, StreamChunk } from "./types";
import { RESPONSE_TRUNCATED_MESSAGE } from "./types";
import webSearch, {
  formatSearchResults,
  parseQuery,
  WEB_SEARCH_DESCRIPTION,
  type WebSearchImage,
  type WebSearchResult,
} from "../../utils/webSearch";

// Upper bound on completion tokens per request — the single biggest
// per-request cost lever, matching the Groq provider. A "warning" chunk is
// yielded when the cap cuts a reply off so the UI can say so.
const MAX_OUTPUT_TOKENS = 2048;

export const WEB_SEARCH_TOOL_NAME = "web_search";

interface WebSearchCall {
  toolCallId: string;
  toolName: string;
  input: unknown;
}

interface ConsumeState {
  textBuffer: string;
  thinkingBuffer: string;
  truncated: boolean;
  usage: StreamChunk["usage"] | undefined;
  toolCalls: WebSearchCall[];
}

interface StreamResult {
  fullStream: AsyncIterable<any>;
  usage?: PromiseLike<any>;
}

/**
 * Injectable dependencies so the tool loop can be unit-tested without the
 * Workers AI binding or the network. Production passes the real
 * `createAI`/`streamText`/`webSearch`; tests pass fakes.
 */
export interface CloudflareStreamDeps {
  createModel: (model: string) => any;
  streamText: (options: any) => StreamResult;
  webSearch: (
    query: string,
    apiKey: string,
  ) => Promise<{ results: WebSearchResult[]; images: WebSearchImage[] }>;
}

function createState(): ConsumeState {
  return {
    textBuffer: "",
    thinkingBuffer: "",
    truncated: false,
    usage: undefined,
    toolCalls: [],
  };
}

/**
 * Normalize AI SDK / Workers AI usage shapes into the app's StreamChunk usage.
 * Field names differ across SDK versions and models.
 */
export function toUsage(usage: any): StreamChunk["usage"] | undefined {
  if (!usage) return undefined;
  const promptTokens =
    usage.inputTokens ?? usage.promptTokens ?? usage.prompt_tokens ?? 0;
  const completionTokens =
    usage.outputTokens ??
    usage.completionTokens ??
    usage.completion_tokens ??
    0;
  const totalTokens =
    usage.totalTokens ??
    usage.total_tokens ??
    promptTokens + completionTokens;
  if (!promptTokens && !completionTokens && !totalTokens) return undefined;
  return { promptTokens, completionTokens, totalTokens };
}

/**
 * AI SDK tool definition for `web_search`. No `execute` is provided: the
 * provider runs Tavily itself between two model calls (mirroring GroqProvider)
 * so tool lifecycle chunks and recoverable failures stay under our control.
 */
export function buildWebSearchTool() {
  return tool({
    description: WEB_SEARCH_DESCRIPTION,
    inputSchema: z.object({
      query: z
        .string()
        .describe("The exact search query to look up on the web."),
    }),
  });
}

/** Extract the search query from a model tool call's arguments. */
export function queryFromInput(input: unknown): string | null {
  if (typeof input === "string") {
    const parsed = parseQuery(input);
    return parsed ? parsed.trim() : null;
  }
  if (input && typeof input === "object") {
    const query = (input as { query?: unknown }).query;
    if (typeof query === "string" && query.trim()) return query.trim();
  }
  return null;
}

/**
 * Detect model/provider rejections caused by attaching tools to a model that
 * cannot handle them. Used to fall back to a plain completion so the user
 * still gets an answer.
 */
function isToolSupportError(err: any): boolean {
  const raw = [
    err?.message,
    err?.error?.message,
    err?.error?.code,
    err?.code,
  ]
    .filter((v) => typeof v === "string")
    .join(" ")
    .toLowerCase();
  if (!raw) return false;
  // Deliberately narrow: only clear tool-contract rejections trigger the
  // plain fallback. Broad tokens like "unsupported" would misclassify
  // unrelated failures and silently drop the user's request.
  return /tool_use_failed|failed to call a function|does not support (tools|tool calling)|tools? (are|is) not supported|no such tool/.test(
    raw,
  );
}

function toolErrorMessage(err: unknown): string {
  return toUserFacingError(err, "web_search");
}

/** Flush any buffered thinking/text held back for smoother chunking. */
function* flushState(state: ConsumeState): Iterable<StreamChunk> {
  if (state.thinkingBuffer.length > 0) {
    yield { type: "thinking", thinking: state.thinkingBuffer };
    state.thinkingBuffer = "";
  }
  if (state.textBuffer.length > 0) {
    yield { type: "delta", delta: state.textBuffer };
    state.textBuffer = "";
  }
}

/**
 * Consume one AI SDK `fullStream`, mapping parts to StreamChunks and
 * accumulating usage, truncation, and tool calls into `state`.
 */
async function* consumeStream(
  result: StreamResult,
  state: ConsumeState,
  flushOnError: boolean = true,
): AsyncIterable<StreamChunk> {
  try {
    for await (const part of result.fullStream as AsyncIterable<any>) {
      if (!part) continue;

      if (part.type === "text-delta") {
        const delta = part.text ?? part.textDelta ?? part.delta ?? "";
        if (delta) {
          state.textBuffer += delta;
          if (state.textBuffer.length > 20) {
            yield { type: "delta", delta: state.textBuffer };
            state.textBuffer = "";
          }
        }
        continue;
      }

      if (part.type === "reasoning-delta" || part.type === "reasoning") {
        const thinking = part.text ?? part.textDelta ?? part.delta ?? "";
        if (thinking) {
          state.thinkingBuffer += thinking;
          if (state.thinkingBuffer.length > 20) {
            yield { type: "thinking", thinking: state.thinkingBuffer };
            state.thinkingBuffer = "";
          }
        }
        continue;
      }

      if (part.type === "tool-call") {
        if (part.toolName === WEB_SEARCH_TOOL_NAME) {
          state.toolCalls.push({
            toolCallId: String(part.toolCallId ?? ""),
            toolName: part.toolName,
            input: part.input,
          });
        }
        continue;
      }

      if (part.type === "finish") {
        state.usage = toUsage(part.totalUsage ?? part.usage);
        const reason = part.finishReason?.unified ?? part.finishReason;
        if (reason === "length" || reason === "max-tokens") {
          state.truncated = true;
        }
        continue;
      }

      if (part.type === "error") {
        throw part.error ?? new Error("Cloudflare AI stream error");
      }
    }
  } catch (err) {
    if (flushOnError) {
      yield* flushState(state);
    }
    throw err;
  }

  if (!state.usage) {
    try {
      state.usage = toUsage(await result.usage);
    } catch {
      state.usage = undefined;
    }
  }
}

/** Build the assistant tool-call and tool-result messages for the final call. */
function buildToolResultMessages(
  calls: WebSearchCall[],
  results: string[],
): any[] {
  return [
    {
      role: "assistant",
      content: calls.map((call) => ({
        type: "tool-call",
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        input: call.input,
      })),
    },
    {
      role: "tool",
      content: calls.map((call, index) => ({
        type: "tool-result",
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        output: {
          type: "text",
          value:
            results[index] ??
            "No search result was available. Answer from your own knowledge.",
        },
      })),
    },
  ];
}

/**
 * Plain single-call streaming path used for non-tool models and as the
 * recoverable fallback when a tool-capable model rejects tools.
 */
async function* streamPlain(
  model: string,
  system: string | undefined,
  conversation: ChatMessage[],
  deps: CloudflareStreamDeps,
): AsyncIterable<StreamChunk> {
  const state = createState();

  let result: StreamResult;
  try {
    result = deps.streamText({
      model: deps.createModel(model),
      system,
      messages: conversation,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    });
  } catch (err) {
    yield { type: "error", message: toUserFacingError(err, "inference") };
    return;
  }

  try {
    yield* consumeStream(result, state);
  } catch (err) {
    yield { type: "error", message: toUserFacingError(err, "inference") };
    return;
  }

  yield* flushState(state);
  if (state.truncated) {
    yield { type: "warning", message: RESPONSE_TRUNCATED_MESSAGE };
  }
  if (state.usage) {
    yield { type: "usage", usage: state.usage };
  }
}

/**
 * Provider-agnostic Cloudflare tool loop. Streams chat for any `@cf/*` model;
 * for tool-capable models it attaches `web_search`, runs Tavily between two
 * model calls, and streams the grounded final answer.
 */
export async function* streamCloudflareChat(
  messages: ChatMessage[],
  model: string,
  tavilyApiKey: string,
  supportsTools: boolean,
  deps: CloudflareStreamDeps,
): AsyncIterable<StreamChunk> {
  const system = messages.find((m) => m.role === "system")?.content;
  const conversation = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  if (!supportsTools) {
    yield* streamPlain(model, system, conversation, deps);
    return;
  }

  // Step 1: ask the model, with tools available.
  const firstState = createState();
  let firstResult: StreamResult;
  try {
    firstResult = deps.streamText({
      model: deps.createModel(model),
      system,
      messages: conversation,
      tools: { [WEB_SEARCH_TOOL_NAME]: buildWebSearchTool() },
      toolChoice: "auto",
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    });
  } catch (err) {
    yield { type: "error", message: toUserFacingError(err, "inference") };
    return;
  }

  try {
    // Discard any buffered first-pass text on failure so the plain fallback
    // does not repeat it. (Text already streamed past the buffer threshold
    // before the failure may still appear before the fallback answer.)
    yield* consumeStream(firstResult, firstState, false);
  } catch (err) {
    if (isToolSupportError(err)) {
      // Model rejected the tool contract — degrade to a plain completion.
      console.error(
        "[cloudflareProvider.stream] model rejected tools; retrying without tools",
        { model, error: (err as any)?.message },
      );
      yield {
        type: "tool",
        tool: { name: WEB_SEARCH_TOOL_NAME, status: "failed" },
      };
      yield {
        type: "error",
        message: toolErrorMessage(err),
        recoverable: true,
      };
      yield* streamPlain(model, system, conversation, deps);
      return;
    }
    yield* flushState(firstState);
    yield { type: "error", message: toUserFacingError(err, "inference") };
    return;
  }

  yield* flushState(firstState);

  const calls = firstState.toolCalls.filter((call) => call.toolCallId);
  if (calls.length === 0) {
    if (firstState.truncated) {
      yield { type: "warning", message: RESPONSE_TRUNCATED_MESSAGE };
    }
    if (firstState.usage) {
      yield { type: "usage", usage: firstState.usage };
    }
    return;
  }

  // Step 1.5: run Tavily for each actionable web_search call.
  const results: string[] = [];
  for (const call of calls) {
    const query = queryFromInput(call.input);

    if (!query) {
      console.warn("[cloudflareProvider.stream] unparseable tool call input", {
        input: call.input,
      });
      yield {
        type: "tool",
        tool: { name: WEB_SEARCH_TOOL_NAME, status: "failed" },
      };
      yield {
        type: "error",
        message: webSearchUnparseableMessage(),
        recoverable: true,
      };
      results.push(
        "No valid search query was found. Summarize what you know and ask the user to clarify.",
      );
      continue;
    }

    yield {
      type: "tool",
      tool: { name: WEB_SEARCH_TOOL_NAME, status: "executing" },
    };

    try {
      const search = await deps.webSearch(query, tavilyApiKey);
      console.log("[cloudflareProvider.stream] web search completed", {
        query,
        resultCount: search.results.length,
        imageCount: search.images.length,
      });
      yield {
        type: "tool",
        tool: { name: WEB_SEARCH_TOOL_NAME, status: "completed" },
      };
      results.push(formatSearchResults(search.results, search.images));
    } catch (err) {
      console.error("[cloudflareProvider.stream] web search failed:", err);
      yield {
        type: "tool",
        tool: { name: WEB_SEARCH_TOOL_NAME, status: "failed" },
      };
      yield {
        type: "error",
        message: toolErrorMessage(err),
        recoverable: true,
      };
      results.push(
        "Web search is temporarily unavailable. Answer from your own knowledge and note that the information may not be current.",
      );
    }
  }

  // Step 2: stream the final, grounded answer with the tool results appended.
  const finalState = createState();
  let finalResult: StreamResult;
  try {
    finalResult = deps.streamText({
      model: deps.createModel(model),
      system,
      messages: [
        ...conversation,
        ...buildToolResultMessages(calls, results),
      ],
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    });
  } catch (err) {
    yield { type: "error", message: toUserFacingError(err, "inference") };
    return;
  }

  try {
    yield* consumeStream(finalResult, finalState);
  } catch (err) {
    yield { type: "error", message: toUserFacingError(err, "inference") };
    return;
  }

  yield* flushState(finalState);

  if (firstState.truncated || finalState.truncated) {
    yield { type: "warning", message: RESPONSE_TRUNCATED_MESSAGE };
  }

  const usage = finalState.usage ?? firstState.usage;
  if (usage) {
    yield { type: "usage", usage };
  }
}

export class CloudflareProvider implements InferenceProvider {
  private binding: any;
  private tavilyApiKey: string;
  private supportsTools: boolean;

  constructor(
    binding: any,
    tavilyApiKey: string = "",
    supportsTools: boolean = false,
  ) {
    if (!binding) {
      throw new Error("The AI binding is missing.");
    }
    this.binding = binding;
    this.tavilyApiKey = tavilyApiKey;
    this.supportsTools = supportsTools;
  }

  async *stream(
    messages: ChatMessage[],
    model: string,
  ): AsyncIterable<StreamChunk> {
    const ai = createAI({ binding: this.binding });
    const deps: CloudflareStreamDeps = {
      createModel: (modelId) => ai(modelId as any),
      streamText: (options) =>
        streamText(options as any) as unknown as StreamResult,
      webSearch: (query, apiKey) => webSearch(query, apiKey),
    };

    yield* streamCloudflareChat(
      messages,
      model,
      this.tavilyApiKey,
      this.supportsTools,
      deps,
    );
  }
}