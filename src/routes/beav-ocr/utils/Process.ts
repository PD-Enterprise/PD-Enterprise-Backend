import { Groq } from "groq-sdk";
import { StreamChunk } from "@/src/routes/grade-ai/routes/providers/types";
import { processPrompt } from "./prompt";

const PROCESSING_MODEL = "openai/gpt-oss-20b";

/**
 * Stage 2 of the beav-ocr pipeline: feed the raw transcription to a text model
 * that formats it (LaTeX math, wrapped-line joining). The stage-2 response is
 * buffered, cleaned of reasoning leakage and echoed input, then emitted as a
 * single staged delta — the frontend swaps the raw transcription for this.
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
        role: "system",
        content: processPrompt,
      },
      {
        role: "user",
        content: rawText,
      },
    ],
    model: PROCESSING_MODEL,
    include_reasoning: false,
    reasoning_effort: "low",
    stream: true,
  });

  const reasoning = { inside: false };
  let output = "";
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  for await (const chunk of result) {
    const text = chunk.choices[0]?.delta.content ?? "";
    if (text) {
      output += dropReasoning(text, reasoning);
    }

    if (chunk.x_groq?.usage) {
      totalPromptTokens = chunk.x_groq.usage.prompt_tokens ?? 0;
      totalCompletionTokens = chunk.x_groq.usage.completion_tokens ?? 0;
    }
  }

  const cleaned = stripEchoedInput(stripMdStructure(output), rawText).trim();
  if (cleaned) {
    yield { type: "delta", stage: "processing", delta: cleaned };
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

// Prompt-markup markers are built without literal think-tag text so this file
// never contains one, which would itself trip reasoning-strip tooling.
const LT = String.fromCharCode(60);
const REASONING_OPEN = LT + "think" + String.fromCharCode(62);
const REASONING_CLOSE = LT + "/think" + String.fromCharCode(62);

/**
 * gpt-oss is a reasoning model. Reasoning normally arrives on delta.reasoning
 * (ignored here), but if it leaks into delta.content inside a think block, cut
 * it out so only final response text accumulates. Tracks open/close markers
 * across streamed chunks via the shared `reasoning` state.
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

/**
 * If the output contains the entire raw transcription repeated somewhere,
 * keep the content on the side with more text — that is the formatted result;
 * the repeated raw blob is an echo of the input and gets dropped.
 */
function stripEchoedInput(output: string, raw: string): string {
  const normOut = withIndexMap(output);
  const normRaw = collapse(raw);
  if (!normOut.text || !normRaw) return output;

  const idx = normOut.text.indexOf(normRaw);
  if (idx === -1) return output;
  // When the collapsed output equals the collapsed input, the model merely
  // repeated the transcription (or line-joined it) — keep it as-is; cutting
  // would leave nothing to display. Only a superstring carries both an echo
  // and additional formatted content worth salvaging.
  if (normOut.text.length <= normRaw.length) {
    console.warn(
      `[beav-ocr] stage-2 output ~= input (${normOut.text.length} vs ${normRaw.length} collapsed chars) ` +
      `— formatting model returned no real transformation`,
    );
    return output;
  }

  const startOrig = normOut.map[idx] ?? 0;
  const endOrig = normOut.map[idx + normRaw.length - 1] ?? output.length - 1;
  const before = output.slice(0, startOrig).trim();
  const after = output.slice(endOrig + 1).trim();
  const lengthThreshold = before.length >= after.length ? before : after;
  console.warn(
    `[beav-ocr] stage-2 echo cut triggered (out=${output.length}, raw=${raw.length} chars, ` +
    `before=${before.length}, after=${after.length})`,
  );
  return lengthThreshold;
}

/**
 * Drop markdown heading lines ("## ") from the output. The extraction prompt
 * forbids markdown in the transcription, so any heading lines in the model's
 * response are prompt structure or echoed headers, not content.
 */
function stripMdStructure(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^\s*#{1,4} /.test(line))
    .join("\n");
}

interface IndexMap {
  text: string;
  map: number[];
}

/** Collapse whitespace runs to single spaces while remembering original offsets. */
function withIndexMap(s: string): IndexMap {
  let text = "";
  const map: number[] = [];
  let pendingSpace = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f" || c === "\v") {
      pendingSpace = true;
    } else {
      if (pendingSpace) {
        text += " ";
        map.push(i);
        pendingSpace = false;
      }
      text += c;
      map.push(i);
    }
  }
  return { text, map };
}

function collapse(s: string): string {
  return withIndexMap(s).text;
}
