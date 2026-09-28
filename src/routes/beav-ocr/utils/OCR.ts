import { GoogleGenAI } from "@google/genai";
import { Groq } from "groq-sdk";
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

  const ocr = new Groq({ apiKey });
  const model = "qwen/qwen3.8-27b";

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
    model,
    include_reasoning: false,
    reasoning_effort: "none",
    stream: true,
  });

  let buffer = "";
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  for await (const chunk of result) {
    const text = chunk.choices[0].delta.content ?? "";
    if (text) {
      buffer += text;

      if (buffer.length > 20) {
        yield { type: "delta", delta: buffer };
        buffer = "";
      }
    }

    if (chunk.x_groq?.usage) {
      totalPromptTokens = chunk.x_groq.usage.prompt_tokens ?? 0;
      totalCompletionTokens = chunk.x_groq.usage.completion_tokens ?? 0;
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
