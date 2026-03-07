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
  ): AsyncIterable<StreamChunk> {}
}
