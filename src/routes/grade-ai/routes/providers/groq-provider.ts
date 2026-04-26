import Groq from "groq-sdk";
import { ChatMessage, InferenceProvider, StreamChunk } from "./types";

export class GroqProvider implements InferenceProvider {
  private client: Groq;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("The GROQ_API_KEY is missing or empty.");
    }
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

    let textBuffer = "";

    for await (const chunk of response) {
      const delta = chunk.choices[0]?.delta?.content;
      // console.log(JSON.stringify(delta));

      if (delta) {
        textBuffer += delta;

        if (textBuffer.length > 20) {
          yield { type: "delta", delta: textBuffer };
          textBuffer = "";
        }
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

    if (textBuffer.length > 0) {
      yield { type: "delta", delta: textBuffer };
    }
  }
}
