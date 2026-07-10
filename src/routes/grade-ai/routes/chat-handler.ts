import { Context } from "hono";
import { ChatMessage, StreamChunk } from "./providers/types";
import {
  NDJSON_HEADERS,
  formatNDJSONChunk,
  formatNDJSONDone,
  formatNDJSONError,
} from "../utils/stream-utils";
import { resolveProvider } from "./providers/provider-factory";
import { ConvexClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { chatRequestSchema } from "@/src/zodSchema";
import { buildMessages } from "../utils/buildMessage";
import { returnJson } from "@/src/utils/returnJson";

export async function handleChat(c: Context): Promise<Response> {
  const body = await c.req.json()
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    console.error("Validation failed", parsed.error.issues);
    c.status(400);
    return c.json(returnJson(400, "Validation failed", null, null));
  }
  const { prompt, provider, model, mode, history, conversationId: clientUUID } = parsed.data;
  const email = c.get("user").email;

  const inferenceProvider = resolveProvider(provider, c.env);

  const convexClient = new ConvexClient(c.env.CONVEX_URL);

  let academicLevel;
  let conversation: any;
  try {
    academicLevel = await convexClient.query(api.users.getAcademicLevel, { email });
    conversation = await convexClient.query(api.conversations.getConversationByClientUUID, { clientUUID });
  } catch (e) {
    convexClient.close();
    c.status(500);
    return c.json(returnJson(500, "Failed to fetch data", null, null));
  }

  if (!academicLevel) {
    convexClient.close();
    c.status(404);
    return c.json(returnJson(404, "Academic level not found", null, academicLevel));
  }

  if (!conversation) {
    convexClient.close();
    c.status(404);
    return c.json(returnJson(404, "Conversation not found", null, null));
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
      let fullResponse = "";

      try {
        for await (const chunk of inferenceProvider.stream(messages, model)) {
          fullResponse += chunk.delta || "";
          controller.enqueue(encode(formatNDJSONChunk(chunk)));
        }
        controller.enqueue(encode(formatNDJSONDone()));

        await convexClient.mutation(api.messages.createMessage, {
          conversationId: conversation._id,
          role: "user",
          content: prompt,
        });

        await convexClient.mutation(api.messages.createMessage, {
          conversationId: conversation._id,
          role: "assistant",
          content: fullResponse,
          model,
          provider,
        });
      } catch (err: any) {
        controller.enqueue(encode(formatNDJSONError(err.message)));
      } finally {
        convexClient.close();
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: NDJSON_HEADERS });
}
