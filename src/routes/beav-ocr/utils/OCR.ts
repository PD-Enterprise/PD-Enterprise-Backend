import { Groq } from "groq-sdk";
import { convertToBase64 } from "./convertToBase64";
import { StreamChunk } from "@/src/routes/grade-ai/routes/providers/types";
import { ocrPrompt } from "./prompt";
import { generateProcessedText } from "./Process";
import { toUserFacingError } from "@/src/utils/sanitizeError";

const OCR_MODEL = "qwen/qwen3.8-27b";

/**
 * Two-stage beav-ocr pipeline. Stage 1 (extraction): a vision model transcribes
 * the handwriting as-is. Stage 2 (processing): the transcription is formatted
 * by a text model. Every event is tagged with its stage so the frontend can
 * show the right state (extraction deltas live, then a swap to processed text).
 */
export async function* generateOCR(
  apiKey: string,
  file: File,
): AsyncIterable<StreamChunk> {
  const base64String = await convertToBase64(file);
  if (!base64String) {
    yield {
      type: "error",
      stage: "extracting",
      message: "File could not be converted to base64 string.",
      recoverable: false,
    };
    return;
  }

  // Stage 1: extraction
  const ocr = new Groq({ apiKey });

  const result = await ocr.chat.completions.create({
    messages: [{
      role: "user",
      content: [
        {
          type: "text",
          text: ocrPrompt,
        },
        {
          type: "image_url",
          image_url: {
            url: `data:image/jpeg;base64,${base64String}`
          }
        }],

    }],
    model: OCR_MODEL,
    include_reasoning: false,
    reasoning_effort: "low",
    stream: true,
  });

  let buffer = "";
  let rawText = "";
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  for await (const chunk of result) {
    const text = chunk.choices[0].delta.content ?? "";
    if (text) {
      buffer += text;
      rawText += text;

      if (buffer.length > 20) {
        yield { type: "delta", stage: "extracting", delta: buffer };
        buffer = "";
      }
    }

    if (chunk.x_groq?.usage) {
      totalPromptTokens = chunk.x_groq.usage.prompt_tokens ?? 0;
      totalCompletionTokens = chunk.x_groq.usage.completion_tokens ?? 0;
    }
  }

  if (buffer.length > 0) {
    yield { type: "delta", stage: "extracting", delta: buffer };
  }

  yield {
    type: "usage",
    stage: "extracting",
    usage: {
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
      totalTokens: totalPromptTokens + totalCompletionTokens,
    },
  };

  // Stage 2: processing. Extraction already succeeded, so a failure here must
  // not kill the stream — the frontend falls back to the raw transcription.
  yield { type: "stage", stage: "processing" };
  try {
    yield* generateProcessedText(apiKey, rawText);
  } catch (err: any) {
    console.error("[beav-ocr] processing stage failed:", err?.message ?? err);
    yield {
      type: "error",
      stage: "processing",
      message: toUserFacingError(err, "ocr"),
      recoverable: true,
    };
  }
}
