import { Context } from "hono";
import { getSystemPrompt } from "./prompts/system-prompts";
import { ChatMessage } from "./providers/types";
import {
  SSE_HEADERS,
  formatSSEChunk,
  formatSSEDone,
} from "../utils/stream-utils";
import { resolveProvider } from "./providers/provider-factory";
import z from "zod";

export const chatRequestSchema = z.object({
  prompt: z.string().min(1).max(2000).trim(),
  provider: z.enum(["groq", "openrouter", "gemini"]),
  model: z.string().min(1),
  mode: z.enum(["socratic", "direct"]),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assitant", "system"]),
        content: z.string(),
      }),
    )
    .default([]),
  conversationId: z.string().min(1),
});

function buildMessages(
  prompt: string,
  history: ChatMessage[],
  mode: "socratic" | "direct",
): ChatMessage[] {
  const systemPrompt = getSystemPrompt(mode);
  return [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: prompt },
  ];
}

export async function handleChat(c: Context): Promise<Response> {
  const env = c.env as {
    GROQ_API_KEY: string;
    OPENROUTER_API_KEY: string;
    GEMINI_API_KEY: string;
  };

  const rawBody = await c.req.json().catch(() => null);
  if (!rawBody) {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = chatRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json(
      { error: "Validation failed", issues: parsed.error.issues },
      400,
    );
  }

  const { prompt, provider, model, mode, history, conversationId } =
    parsed.data;

  let inferenceProvider: any;
  try {
    inferenceProvider = resolveProvider(provider, env);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }

  const messages = buildMessages(prompt, history as ChatMessage[], mode);

  const stream = new ReadableStream({
    async start(controller) {
      const encode = (str: string) => new TextEncoder().encode(str);

      try {
        for await (const chunk of inferenceProvider.stream(messages, model)) {
          controller.enqueue(encode(formatSSEChunk(chunk)));
        }
        controller.enqueue(encode(formatSSEDone()));
      } catch (err: any) {
        const errorChunk = `event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`;
        controller.enqueue(encode(errorChunk));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
