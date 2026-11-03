import { Groq } from "groq-sdk";
import { StreamChunk } from "@/src/routes/grade-ai/routes/providers/types";
import { processPrompt } from "./prompt";

const PROCESSING_MODEL = "openai/gpt-oss-20b";

/**
 * Stage 2 of the beav-ocr pipeline: feed the raw transcription to a text model
 * that formats it (LaTeX math, wrapped-line joining). Yields staged deltas and
 * a usage summary; the caller supplies the raw stage-1 transcription.
 */
export async function* generateProcessedText(
  apiKey: string,
  rawText: string,
): AsyncIterable<StreamChunk> {
  if (!rawText.trim()) {
    return;
  }

  const groq = new Groq({ apiKey });

  const result = await groq.chat.completions.create({
    messages: [
      {
        role: "user",
        content: `${processPrompt}\n\n## Transcription to format\n\n${rawText}`,
      },
    ],
    model: PROCESSING_MODEL,
    include_reasoning: false,
    reasoning_effort: "low",
    stream: true,
  });

  let buffer = "";
  const reasoning = { inside: false };
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  for await (const chunk of result) {
    const text = chunk.choices[0]?.delta.content ?? "";
    if (text) {
      const clean = dropReasoning(text, reasoning);
      if (clean) {
        buffer += clean;

        if (buffer.length > 20) {
          yield {
            type: "delta",
            stage: "processing",
            delta: buffer,
          };
          buffer = "";
        }
      }
    }

    if (chunk.x_groq?.usage) {
      totalPromptTokens = chunk.x_groq.usage.prompt_tokens ?? 0;
      totalCompletionTokens = chunk.x_groq.usage.completion_tokens ?? 0;
    }
  }

  if (buffer.length > 0) {
    yield { type: "delta", stage: "processing", delta: buffer };
  }

  yield {
    type: "usage",
    stage: "processing",
    usage: {
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
      totalTokens: totalPromptTokens + totalCompletionTokens,
    },
  };
}

// Tag markers are built from char codes so this file never contains a literal
// think-tag, which itself would trip reasoning-strip tooling.
const LT = String.fromCharCode(60);
const REASONING_OPEN = `${LT}think${String.fromCharCode(62)}`;
const REASONING_CLOSE = `${LT}/${"think"}${String.fromCharCode(62)}`;

/**
 * gpt-oss is a reasoning model. Reasoning normally arrives on delta.reasoning
 * (ignored here), but if it leaks into delta.content inside a reasoning block,
 * cut it out so only final response text reaches the stream. Tracks open/close
 * markers across streamed chunks via the shared `reasoning` state.
 */
function dropReasoning(text: string, reasoning: { inside: boolean }): string {
  let t = text;

  if (reasoning.inside) {
    const end = t.indexOf(REASONING_CLOSE);
    if (end === -1) return "";
    t = t.slice(end + REASONING_CLOSE.length);
    reasoning.inside = false;
  }

  const start = t.indexOf(REASONING_OPEN);
  if (start !== -1) {
    const end = t.indexOf(REASONING_CLOSE, start);
    if (end === -1) {
      reasoning.inside = true;
      t = t.slice(0, start);
    } else {
      t = t.slice(0, start) + t.slice(end + REASONING_CLOSE.length);
    }
  }

  return t;
}
