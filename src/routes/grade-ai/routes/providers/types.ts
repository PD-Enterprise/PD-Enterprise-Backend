export type ChatRole = "user" | "assistant" | "system";
export type ModeType = "socratic" | "direct";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  model?: string;
  modeType?: ModeType;
}


export interface ChatRequestBody {
  prompt: string;
  provider: "groq" | "gemini";
  model: string;
  mode: ModeType;
  history: ChatMessage[];
  conversationId: string;
}

export interface StreamChunk {
  type: "delta" | "usage" | "done" | "error";
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
