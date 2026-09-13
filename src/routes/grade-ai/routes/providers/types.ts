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
  | "warning"
  | "error";

/** Sent when the model hit MAX_OUTPUT_TOKENS and the reply was cut off. */
export const RESPONSE_TRUNCATED_MESSAGE =
  "Response was cut off at the length limit — ask for a shorter answer or say “continue” to get the rest.";

/** Sent when older thread messages were dropped to fit the context window. */
export const CONTEXT_TRUNCATED_MESSAGE =
  "Older messages in this thread were left out so the reply fits — the answer only uses the most recent messages for context.";

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
