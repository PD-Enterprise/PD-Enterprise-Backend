import { Content, GoogleGenAI } from "@google/genai";
import { ChatMessage, InferenceProvider, StreamChunk } from "./types";

export class GeminiProvider implements InferenceProvider {
  private client: GoogleGenAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async *stream(
    messages: ChatMessage[],
    model: string,
  ): AsyncIterable<StreamChunk> {
    const systemMessage = messages.find((m) => m.role === "system");
    const conversationMessages = messages.filter((m) => m.role !== "system");

    const history: Content[] = conversationMessages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const lastMessage = conversationMessages.at(-1);
    if (!lastMessage) return;

    const chat = this.client.chats.create({
      model,
      history,
      config: {
        systemInstruction: systemMessage?.content,
      },
    });
    const result = await chat.sendMessageStream({
      message: lastMessage.content,
    });

    let buffer = "";
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;

    for await (const chunk of result) {
      const delta = chunk.text;

      if (delta) {
        buffer += delta;

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
}
