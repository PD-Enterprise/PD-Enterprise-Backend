import { ChatMessage } from "../routes/providers/types";
import { getSystemPrompt } from "../routes/prompts/system-prompts";

export function buildMessages(
    prompt: string,
    history: ChatMessage[],
    mode: "socratic" | "direct",
    academicLevel: string,
): ChatMessage[] {
    const systemPrompt = getSystemPrompt(mode, academicLevel);

    return [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: prompt },
    ];
}
