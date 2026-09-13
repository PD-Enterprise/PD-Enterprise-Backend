import { ChatMessage } from "../routes/providers/types";
import { getSystemPrompt } from "../routes/prompts/system-prompts";

interface ConvexMessage {
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: number;
}

/**
 * Maximum persisted thread messages sent to the model per request. Threads
 * grow without bound, so without truncation every call in a long thread
 * pays the full conversation as input tokens — a cost amplifier for
 * compromised/stolen sessions. The newest messages carry the context.
 */
const MAX_THREAD_CONTEXT_MESSAGES = 40;
/** Same bound for client-supplied history (validation allows up to 40). */
const MAX_HISTORY_MESSAGES = 40;

export interface BuiltMessages {
  messages: ChatMessage[];
  /** True when older messages were dropped to fit the context window. */
  contextTruncated: boolean;
  /** How many older messages were dropped (0 when nothing was dropped). */
  droppedCount: number;
}

export function buildMessages(
    prompt: string,
    history: ChatMessage[],
    mode: "socratic" | "direct",
    academicLevel: string,
    convexMessages?: ConvexMessage[],
    provider: "groq" | "gemini" = "groq",
): BuiltMessages {
    const systemPrompt = getSystemPrompt(mode, academicLevel, provider);

    if (convexMessages && convexMessages.length > 0) {
      const sorted = [...convexMessages].sort((a, b) => a.createdAt - b.createdAt);
      const recent = sorted.slice(-MAX_THREAD_CONTEXT_MESSAGES);
      const mapped: ChatMessage[] = recent.map(m => ({ role: m.role, content: m.content }));
      return {
        messages: [
          { role: "system", content: systemPrompt },
          ...mapped,
          { role: "user", content: prompt },
        ],
        contextTruncated: sorted.length > recent.length,
        droppedCount: sorted.length - recent.length,
      };
    }

    const recentHistory = history.slice(-MAX_HISTORY_MESSAGES);
    return {
      messages: [
        { role: "system", content: systemPrompt },
        ...recentHistory,
        { role: "user", content: prompt },
      ],
      contextTruncated: history.length > recentHistory.length,
      droppedCount: history.length - recentHistory.length,
    };
}
