export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export type ModeType = "socratic" | "direct";

export interface ChatRequestBody {
  prompt: string;
  provider: "groq" | "openrouter" | "gemini";
  model: string;
  mode: ModeType;
  histroy: ChatMessage[];
  conversationId: string;
}

export interface StreamChunk {
  type: "delta" | "usage";
  delta?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface InferenceProvider {
  stream(messages: ChatMessage[], model: string): AsyncIterable<StreamChunk>;
}
