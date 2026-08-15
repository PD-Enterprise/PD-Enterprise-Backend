import { GoogleGenAI } from "@google/genai";
import { convertToBase64 } from "./convertToBase64";
import { StreamChunk } from "@/src/routes/grade-ai/routes/providers/types";
import { ocrPrompt } from "./prompt";

export async function* generateOCR(
  apiKey: string,
  file: File,
): AsyncIterable<StreamChunk> {
  const base64String = await convertToBase64(file);
  if (!base64String) {
    yield {
      type: "error",
      message: "File could not be converted to base64 string.",
      recoverable: false,
    };
    return;
  }

  const ocr = new GoogleGenAI({ apiKey });
  const model = "gemini-3.1-flash-lite";
  const imagePart = { inlineData: { data: base64String, mimeType: file.type } };
  const contents = [
    {
      role: "user",
      parts: [imagePart, { text: ocrPrompt }],
    },
  ];

  const result = await ocr.models.generateContentStream({ model, contents });

  let buffer = "";
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  for await (const chunk of result) {
    const text = chunk.text ?? "";
    if (text) {
      buffer += text;

      if (buffer.length > 20) {
        yield { type: "delta", delta: buffer };
        buffer = "";
      }
    }

    if (chunk.usageMetadata) {
      totalPromptTokens = chunk.usageMetadata.promptTokenCount ?? 0;
      totalCompletionTokens = chunk.usageMetadata.candidatesTokenCount ?? 0;
    }
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
