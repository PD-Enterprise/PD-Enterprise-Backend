import Groq from "groq-sdk";
import { ChatMessage, InferenceProvider, StreamChunk } from "./types";

export class GroqProvider implements InferenceProvider {
  private client: Groq;

  constructor(apiKey: string) {
    this.client = new Groq({ apiKey });
  }

  async *stream(
    messages: ChatMessage[],
    model: string,
  ): AsyncIterable<StreamChunk> {
    const response = await this.client.chat.completions.create({
      model,
      messages,
      stream: true,
    });

    for await (const chunk of response) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        yield { type: "delta", delta };
      }

      if (chunk.x_groq?.usage) {
        const u = chunk.x_groq.usage;
        yield {
          type: "usage",
          usage: {
            promptTokens: u.prompt_tokens,
            completionTokens: u.completion_tokens,
            totalTokens: u.total_tokens,
          },
        };
      }
    }
  }
}
