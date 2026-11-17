import { createAI } from "agents/models/ai-sdk";
import { streamText } from "ai";
import { toUserFacingError } from "@/src/utils/sanitizeError";
import type { ChatMessage, InferenceProvider, StreamChunk } from "./types";
import { RESPONSE_TRUNCATED_MESSAGE } from "./types";

const MAX_OUTPUT_TOKENS = 2048;

function toUsage(usage: any): StreamChunk["usage"] | undefined {
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

export class CloudflareProvider implements InferenceProvider {
  private binding: any;

  constructor(binding: any) {
    if (!binding) {
      throw new Error("The AI binding is missing.");
    }
    this.binding = binding;
  }

  async *stream(
    messages: ChatMessage[],
    model: string,
  ): AsyncIterable<StreamChunk> {
    const ai = createAI({ binding: this.binding });
    const system = messages.find((m) => m.role === "system")?.content;
    const conversation = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    let result: any;
    try {
      result = streamText({
        model: ai(model as any),
        system,
        messages: conversation,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      } as any);
    } catch (err) {
      yield { type: "error", message: toUserFacingError(err, "inference") };
      return;
    }

    let textBuffer = "";
    let thinkingBuffer = "";
    let truncated = false;
    let usage: StreamChunk["usage"] | undefined;

    try {
      for await (const part of result.fullStream as AsyncIterable<any>) {
        if (!part) continue;
        if (part.type === "text-delta") {
          const delta = part.textDelta ?? part.delta ?? part.text ?? "";
          if (delta) {
            textBuffer += delta;
            if (textBuffer.length > 20) {
              yield { type: "delta", delta: textBuffer };
              textBuffer = "";
            }
          }
          continue;
        }
        if (part.type === "reasoning-delta" || part.type === "reasoning") {
          const thinking = part.textDelta ?? part.delta ?? part.text ?? "";
          if (thinking) {
            thinkingBuffer += thinking;
            if (thinkingBuffer.length > 20) {
              yield { type: "thinking", thinking: thinkingBuffer };
              thinkingBuffer = "";
            }
          }
          continue;
        }
        if (part.type === "finish") {
          usage = toUsage(part.totalUsage ?? part.usage);
          const reason = part.finishReason?.unified ?? part.finishReason;
          if (reason === "length" || reason === "max-tokens") {
            truncated = true;
          }
          continue;
        }
        if (part.type === "error") {
          throw part.error ?? new Error("Cloudflare AI stream error");
        }
      }

      if (!usage) {
        try {
          usage = toUsage(await result.usage);
        } catch {
          usage = undefined;
        }
      }
    } catch (err) {
      if (thinkingBuffer.length > 0) {
        yield { type: "thinking", thinking: thinkingBuffer };
        thinkingBuffer = "";
      }
      if (textBuffer.length > 0) {
        yield { type: "delta", delta: textBuffer };
        textBuffer = "";
      }
      yield { type: "error", message: toUserFacingError(err, "inference") };
      return;
    }

    if (thinkingBuffer.length > 0) {
      yield { type: "thinking", thinking: thinkingBuffer };
    }
    if (textBuffer.length > 0) {
      yield { type: "delta", delta: textBuffer };
    }
    if (truncated) {
      yield { type: "warning", message: RESPONSE_TRUNCATED_MESSAGE };
    }
    if (usage) {
      yield { type: "usage", usage };
    }
  }
}
