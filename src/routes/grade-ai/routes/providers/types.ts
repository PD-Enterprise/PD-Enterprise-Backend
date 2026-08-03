export type ChatRole = "user" | "assistant" | "system";
export type ModeType = "socratic" | "direct";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  model?: string;
}

export interface ChatRequestBody {
  prompt: string;
  provider: "groq" | "gemini";
  mode: ModeType;
  history: ChatMessage[];
  conversationId: string;
}

export type StreamChunkType =
  | "delta"
  | "thinking"
  | "tool"
  | "usage"
  | "done"
  | "error";

export interface ToolChunk {
  name: string;
  status: "executing" | "completed" | "failed";
}

export interface StreamChunk {
  type: StreamChunkType;
  delta?: string;
  thinking?: string;
  tool?: ToolChunk;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  message?: string;
  recoverable?: boolean;
}

export interface InferenceProvider {
  stream(messages: ChatMessage[], model: string): AsyncIterable<StreamChunk>;
}
