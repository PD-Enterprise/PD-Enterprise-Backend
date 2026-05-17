import { Context } from "hono";
import { getSystemPrompt } from "./prompts/system-prompts";
import { ChatMessage } from "./providers/types";
import {
  NDJSON_HEADERS,
  formatNDJSONChunk,
  formatNDJSONDone,
} from "../utils/stream-utils";
import { resolveProvider } from "./providers/provider-factory";
import z from "zod";
import { Bindings } from "../../../types";
import { ConvexClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";

export const chatRequestSchema = z.object({
  prompt: z.string().min(1).max(2000).trim(),
  provider: z.enum(["groq", "gemini"]),
  model: z.string().min(1),
  mode: z.enum(["socratic", "direct"]),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string(),
      }),
    )
    .default([]),
  conversationId: z.string().min(1),
  email: z.string().min(10),
});

function buildMessages(
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

export async function handleChat(c: Context): Promise<Response> {
  const convexClient = new ConvexClient(c.env.CONVEX_URL);
  if (!convexClient) {
    console.error("CRITICAL: Missing Convex URL");
    return new Response("CRITICAL: Missing Convex URL", { status: 500 });
  }

  const env = c.env;
  if (!env.GROQ_API_KEY || !env.GEMINI_API_KEY) {
    console.error("CRITICAL: Missing API keys");
  }

  const rawBody = await c.req.json().catch(() => null);
  if (!rawBody) {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = chatRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    console.log("Validation failed", parsed.error.issues);
    return c.json(
      { error: "Validation failed", issues: parsed.error.issues },
      400,
    );
  }

  const { prompt, provider, model, mode, history, conversationId, email } =
    parsed.data;

  let inferenceProvider: any;
  try {
    inferenceProvider = resolveProvider(provider, env);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }

  const academicLevel = await convexClient.query(api.users.getAcademicLevel, {
    email,
  });
  if (!academicLevel) {
    return new Response("CRITICAL: Missing academic level", { status: 500 });
  }

  const messages = buildMessages(
    prompt,
    history as ChatMessage[],
    mode,
    academicLevel.academicLevel,
  );

  const stream = new ReadableStream({
    async start(controller) {
      const encode = (str: string) => new TextEncoder().encode(str);

      try {
        for await (const chunk of inferenceProvider.stream(messages, model)) {
          controller.enqueue(encode(formatNDJSONChunk(chunk)));
        }
        controller.enqueue(encode(formatNDJSONDone()));
      } catch (err: any) {
        const errorChunk =
          JSON.stringify({
            type: "error",
            message: err.message,
          }) + "\n";
        controller.enqueue(encode(errorChunk));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: NDJSON_HEADERS });
}
