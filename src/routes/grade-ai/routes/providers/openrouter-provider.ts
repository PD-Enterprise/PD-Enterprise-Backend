import OpenAI from "openai";
import { ChatMessage, InferenceProvider, StreamChunk } from "./types";
export class OpenRouterProvider implements InferenceProvider {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey,
      defaultHeaders: {
        "HTTP-Referer": "https://grade-ai.pages.dev",
      },
    });
  }

  async *stream(
    messages: ChatMessage[],
    model: string,
  ): AsyncIterable<StreamChunk> {
    let promptTokens = 0;
    let completionTokens = 0;

    const stream = await this.client.chat.completions.create({
      model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        completionTokens++;
        yield { type: "delta", delta };
      }

      if (chunk.usage) {
        promptTokens = chunk.usage.prompt_tokens ?? 0;
        completionTokens = chunk.usage.completion_tokens ?? completionTokens;
      }
    }

    yield {
      type: "usage",
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
    };
  }
}
