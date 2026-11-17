import { describe, expect, test } from "bun:test";
import {
  buildWebSearchTool,
  queryFromInput,
  streamCloudflareChat,
  toUsage,
  type CloudflareStreamDeps,
} from "./cloudflare-provider";
import type { ChatMessage, StreamChunk } from "./types";
import { modelSupportsTools } from "../../utils/modelList";
import { getSystemPrompt } from "../prompts/system-prompts";

const messages: ChatMessage[] = [
  { role: "system", content: "system prompt" },
  { role: "user", content: "What is the weather?" },
];

function streamOf(parts: any[], usage?: any) {
  return {
    fullStream: (async function* () {
      for (const part of parts) yield part;
    })(),
    usage: Promise.resolve(usage),
  };
}

function makeDeps(
  handler: (options: any, callIndex: number) => any,
  webSearchImpl?: (query: string, apiKey: string) => Promise<any>,
) {
  const calls: any[] = [];
  const deps: CloudflareStreamDeps = {
    createModel: (model: string) => ({ modelId: model }),
    streamText: (options: any) => {
      calls.push(options);
      return handler(options, calls.length - 1);
    },
    webSearch:
      webSearchImpl ??
      (async () => ({
        results: [
          {
            title: "Title",
            url: "https://example.com",
            content: "Content",
          },
        ],
        images: [],
      })),
  };
  return { calls, deps };
}

async function collect(
  iter: AsyncIterable<StreamChunk>,
): Promise<StreamChunk[]> {
  const out: StreamChunk[] = [];
  for await (const chunk of iter) out.push(chunk);
  return out;
}

describe("toUsage", () => {
  test("normalizes SDK and provider field names", () => {
    expect(
      toUsage({ inputTokens: 3, outputTokens: 5, totalTokens: 8 }),
    ).toEqual({ promptTokens: 3, completionTokens: 5, totalTokens: 8 });
    expect(toUsage({ prompt_tokens: 1, completion_tokens: 2 })).toEqual({
      promptTokens: 1,
      completionTokens: 2,
      totalTokens: 3,
    });
    expect(toUsage(undefined)).toBeUndefined();
    expect(toUsage({ inputTokens: 0, outputTokens: 0, totalTokens: 0 })).toBeUndefined();
  });
});

describe("queryFromInput", () => {
  test("reads object and JSON string inputs", () => {
    expect(queryFromInput({ query: "  cats " })).toBe("cats");
    expect(queryFromInput('{"query":"dogs"}')).toBe("dogs");
    expect(queryFromInput({})).toBeNull();
    expect(queryFromInput("not json")).toBeNull();
    expect(queryFromInput(undefined)).toBeNull();
  });
});

describe("modelSupportsTools", () => {
  test("is conservative and only true for vetted models", () => {
    expect(modelSupportsTools("@cf/zai-org/glm-4.7-flash")).toBe(true);
    expect(modelSupportsTools("@cf/moonshotai/kimi-k2.5")).toBe(true);
    expect(modelSupportsTools("@cf/meta/llama-3.1-8b-instruct")).toBe(false);
    expect(modelSupportsTools("@cf/qwen/qwen3.8-27b")).toBe(false);
    expect(modelSupportsTools(undefined)).toBe(false);
  });
});

describe("buildWebSearchTool", () => {
  test("defines web_search with a required query", () => {
    const toolDef = buildWebSearchTool();
    expect(toolDef.description).toContain("Search the web");
    const parsed = (toolDef.inputSchema as any).safeParse({ query: "cats" });
    expect(parsed.success).toBe(true);
    const invalid = (toolDef.inputSchema as any).safeParse({});
    expect(invalid.success).toBe(false);
  });
});

describe("getSystemPrompt", () => {
  test("non-tool cloudflare prompt omits tool and image sections", () => {
    const withTools = getSystemPrompt("direct", "beginner", "cloudflare", true);
    const withoutTools = getSystemPrompt("direct", "beginner", "cloudflare", false);

    expect(withTools).toContain("Web search tool:");
    expect(withTools).toContain("Images:");
    expect(withoutTools).not.toContain("Web search tool:");
    expect(withoutTools).not.toContain("Images:");
    expect(withoutTools).toContain("Your goal is");
  });

  test("gemini keeps native grounding instructions", () => {
    const gemini = getSystemPrompt("direct", "beginner", "gemini", false);
    expect(gemini).toContain("built-in Google Search grounding");
  });
});

describe("streamCloudflareChat plain path", () => {
  test("streams deltas and usage without tools", async () => {
    const { calls, deps } = makeDeps(() =>
      streamOf([
        { type: "text-delta", text: "Hello world" },
        {
          type: "finish",
          finishReason: "stop",
          totalUsage: { inputTokens: 4, outputTokens: 6, totalTokens: 10 },
        },
      ]),
    );

    const chunks = await collect(
      streamCloudflareChat(messages, "model", "", false, deps),
    );

    expect(chunks).toEqual([
      { type: "delta", delta: "Hello world" },
      {
        type: "usage",
        usage: { promptTokens: 4, completionTokens: 6, totalTokens: 10 },
      },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0].tools).toBeUndefined();
  });

  test("length finish emits truncation warning", async () => {
    const { deps } = makeDeps(() =>
      streamOf([
        { type: "text-delta", text: "cut" },
        { type: "finish", finishReason: "length" },
      ]),
    );

    const chunks = await collect(
      streamCloudflareChat(messages, "model", "", false, deps),
    );

    expect(chunks.some((c) => c.type === "warning")).toBe(true);
  });
});

describe("streamCloudflareChat tool loop", () => {
  test("runs web_search then streams the grounded answer", async () => {
    const { calls, deps } = makeDeps((_options, index) => {
      if (index === 0) {
        return streamOf([
          {
            type: "tool-call",
            toolCallId: "call_1",
            toolName: "web_search",
            input: { query: "weather" },
          },
          { type: "finish", finishReason: "tool-calls" },
        ]);
      }
      return streamOf([
        { type: "text-delta", text: "It is sunny." },
        {
          type: "finish",
          finishReason: "stop",
          totalUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        },
      ]);
    });

    const chunks = await collect(
      streamCloudflareChat(messages, "model", "tvly-key", true, deps),
    );

    expect(chunks).toEqual([
      { type: "tool", tool: { name: "web_search", status: "executing" } },
      { type: "tool", tool: { name: "web_search", status: "completed" } },
      { type: "delta", delta: "It is sunny." },
      {
        type: "usage",
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      },
    ]);
    expect(calls).toHaveLength(2);
    expect(calls[0].tools).toBeDefined();
    expect(calls[1].tools).toBeUndefined();

    const secondMessages = calls[1].messages;
    const hasToolResult = secondMessages.some(
      (m: any) => m.role === "tool",
    );
    const hasToolCall = secondMessages.some(
      (m: any) =>
        m.role === "assistant" &&
        Array.isArray(m.content) &&
        m.content[0]?.type === "tool-call",
    );
    expect(hasToolCall).toBe(true);
    expect(hasToolResult).toBe(true);
  });

  test("web search failure yields a recoverable error and still answers", async () => {
    const { deps } = makeDeps(
      (_options, index) => {
        if (index === 0) {
          return streamOf([
            {
              type: "tool-call",
              toolCallId: "call_1",
              toolName: "web_search",
              input: { query: "news" },
            },
            { type: "finish", finishReason: "tool-calls" },
          ]);
        }
        return streamOf([
          { type: "text-delta", text: "Fallback answer." },
          { type: "finish", finishReason: "stop" },
        ]);
      },
      async () => {
        throw new Error("search service is temporarily unavailable.");
      },
    );

    const chunks = await collect(
      streamCloudflareChat(messages, "model", "tvly-key", true, deps),
    );

    expect(chunks).toContainEqual({
      type: "tool",
      tool: { name: "web_search", status: "failed" },
    });
    const errChunk = chunks.find((c) => c.type === "error");
    expect(errChunk?.recoverable).toBe(true);
    expect(
      chunks.some((c) => c.type === "delta" && c.delta === "Fallback answer."),
    ).toBe(true);
  });

  test("unparseable tool input yields failed tool and recoverable error", async () => {
    const { deps } = makeDeps((_options, index) => {
      if (index === 0) {
        return streamOf([
          {
            type: "tool-call",
            toolCallId: "call_1",
            toolName: "web_search",
            input: {},
          },
          { type: "finish", finishReason: "tool-calls" },
        ]);
      }
      return streamOf([
        { type: "text-delta", text: "Can you clarify?" },
        { type: "finish", finishReason: "stop" },
      ]);
    });

    const chunks = await collect(
      streamCloudflareChat(messages, "model", "tvly-key", true, deps),
    );

    expect(chunks).toContainEqual({
      type: "tool",
      tool: { name: "web_search", status: "failed" },
    });
    const errChunk = chunks.find((c) => c.type === "error");
    expect(errChunk?.recoverable).toBe(true);
  });

  test("model rejecting tools falls back to a plain completion", async () => {
    const { calls, deps } = makeDeps((_options, index) => {
      if (index === 0) {
        return {
          fullStream: (async function* () {
            yield { type: "error", error: new Error("Model does not support tools") };
          })(),
          usage: Promise.resolve(undefined),
        };
      }
      return streamOf([
        { type: "text-delta", text: "Plain answer." },
        { type: "finish", finishReason: "stop" },
      ]);
    });

    const chunks = await collect(
      streamCloudflareChat(messages, "model", "tvly-key", true, deps),
    );

    expect(chunks).toContainEqual({
      type: "tool",
      tool: { name: "web_search", status: "failed" },
    });
    const errChunk = chunks.find((c) => c.type === "error");
    expect(errChunk?.recoverable).toBe(true);
    expect(
      chunks.some((c) => c.type === "delta" && c.delta === "Plain answer."),
    ).toBe(true);
    expect(calls).toHaveLength(2);
  });

  test("hard stream errors yield an error chunk", async () => {
    const { deps } = makeDeps(() => ({
      fullStream: (async function* () {
        yield { type: "error", error: new Error("boom") };
      })(),
      usage: Promise.resolve(undefined),
    }));

    const chunks = await collect(
      streamCloudflareChat(messages, "model", "tvly-key", true, deps),
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe("error");
    expect(chunks[0].recoverable).toBeUndefined();
  });
});