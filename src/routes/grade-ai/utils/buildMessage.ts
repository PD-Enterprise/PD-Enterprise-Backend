import { ChatMessage } from "../routes/providers/types";
import { getSystemPrompt } from "../routes/prompts/system-prompts";

interface ConvexMessage {
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: number;
}

export function buildMessages(
    prompt: string,
    history: ChatMessage[],
    mode: "socratic" | "direct",
    academicLevel: string,
    convexMessages?: ConvexMessage[],
): ChatMessage[] {
    const systemPrompt = getSystemPrompt(mode, academicLevel);

    if (convexMessages && convexMessages.length > 0) {
      const sorted = [...convexMessages].sort((a, b) => a.createdAt - b.createdAt);
      const mapped: ChatMessage[] = sorted.map(m => ({ role: m.role, content: m.content }));
      return [
        { role: "system", content: systemPrompt },
        ...mapped,
        { role: "user", content: prompt },
      ];
    }

    return [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: prompt },
    ];
}
