import { Context } from "hono";
import { ChatMessage, CONTEXT_TRUNCATED_MESSAGE } from "./providers/types";
import {
  NDJSON_HEADERS,
  formatNDJSONChunk,
  formatNDJSONDone,
  formatNDJSONError,
} from "@/src/utils/stream-utils";
import { resolveProvider } from "./providers/provider-factory";
import { ConvexClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { chatRequestSchema } from "@/src/zodSchema";
import { buildMessages } from "../utils/buildMessage";
import { returnJson } from "@/src/utils/returnJson";
import { toUserFacingError } from "@/src/utils/sanitizeError";

export async function handleChat(c: Context): Promise<Response> {
  const body = await c.req.json();
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    console.error("Validation failed", parsed.error.issues);
    c.status(400);
    return c.json(returnJson(400, "Validation failed", null, null));
  }
  const {
    prompt,
    provider,
    model,
    mode,
    history,
    conversationId: clientUUID,
    messageClientId,
    assistantClientId,
  } = parsed.data;
  const email = c.get("user")?.email;
  if (!email) {
    c.status(401);
    return c.json(returnJson(401, "Unauthorized", null, null));
  }

  let inferenceProvider;
  try {
    inferenceProvider = resolveProvider(provider, c.env, model);
  } catch (err: any) {
    c.status(400);
    return c.json(returnJson(400, "Unsupported model", null, null));
  }

  const convexClient = new ConvexClient(c.env.CONVEX_URL);

  let academicLevel;
  let conversation: any;
  let user: any;
  try {
    [academicLevel, conversation, user] = await Promise.all([
      convexClient.query(api.users.getAcademicLevel, { email }),
      convexClient.query(api.conversations.getConversationByClientUUID, {
        clientUUID,
      }),
      convexClient.query(api.users.getUserByEmail, { email }),
    ]);
  } catch (e) {
    convexClient.close();
    c.status(500);
    return c.json(returnJson(500, "Failed to fetch data", null, null));
  }

  if (!user) {
    convexClient.close();
    c.status(404);
    return c.json(returnJson(404, "User not found", null, null));
  }

  if (!academicLevel) {
    convexClient.close();
    c.status(404);
    return c.json(
      returnJson(404, "Academic level not found", null, null),
    );
  }

  if (!conversation) {
    convexClient.close();
    c.status(404);
    return c.json(returnJson(404, "Conversation not found", null, null));
  }

  if (conversation.userId !== user._id) {
    convexClient.close();
    c.status(403);
    return c.json(returnJson(403, "Forbidden", null, null));
  }

  // Daily per-user LLM quota (persistent in Convex, survives isolates).
  // The unit is RESERVED up-front (atomic, so parallel spam can't overshoot)
  // and REFUNDED on any path where no LLM response is produced — net effect:
  // quota is only consumed when a response is actually generated.
  const today = new Date().toISOString().slice(0, 10);
  try {
    const quota = await convexClient.mutation(api.llmUsage.checkAndIncrement, {
      userId: user._id,
      date: today,
    });
    if (!quota.allowed) {
      convexClient.close();
      c.status(429);
      return c.json(
        returnJson(429, "Daily chat limit reached, try again tomorrow.", null, null),
      );
    }
  } catch (e) {
    convexClient.close();
    c.status(500);
    return c.json(returnJson(500, "Failed to check quota", null, null));
  }

  const refundQuota = async () => {
    try {
      await convexClient.mutation(api.llmUsage.refund, {
        userId: user._id,
        date: today,
      });
    } catch (refundErr) {
      console.error("[chat] quota refund failed:", refundErr);
    }
  };

  let convexMessages: any[] = [];
  try {
    convexMessages = await convexClient.query(
      api.messages.getMessagesByConversation,
      { conversationId: conversation._id },
    );
  } catch (e) {
    await refundQuota();
    convexClient.close();
    c.status(500);
    return c.json(returnJson(500, "Failed to fetch messages", null, null));
  }

  // When resending, rebuild the context: drop the message pair being
  // regenerated (and anything after it) so the model only sees the
  // conversation up to the prompt being re-answered, not stale responses.
  const sortedConvex = [...convexMessages].sort(
    (a: any, b: any) => a.createdAt - b.createdAt,
  );
  let contextMessages = sortedConvex;
  const resendIndex = sortedConvex.findIndex(
    (m: any) => m.clientUUID === assistantClientId,
  );
  if (resendIndex !== -1) {
    contextMessages = sortedConvex.slice(0, resendIndex);
  }
  contextMessages = contextMessages.filter(
    (m: any) => m.clientUUID !== messageClientId,
  );

  const { messages, contextTruncated, droppedCount } = buildMessages(
    prompt,
    history as ChatMessage[],
    mode,
    academicLevel.academicLevel,
    contextMessages,
    provider,
  );
  if (contextTruncated) {
    console.log("[chat] context truncated", {
      droppedCount,
      totalMessages: contextMessages.length,
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encode = (str: string) => new TextEncoder().encode(str);
      let fullResponse = "";
      let doneSent = false;
      let errorSent = false;
      const warnings: string[] = [];
      let hardErrorMessage = "";
      if (contextTruncated) {
        warnings.push(CONTEXT_TRUNCATED_MESSAGE);
      }

      try {
        if (contextTruncated) {
          controller.enqueue(
            encode(formatNDJSONChunk({ type: "warning", message: CONTEXT_TRUNCATED_MESSAGE })),
          );
        }
        for await (const chunk of inferenceProvider.stream(messages, model)) {
          fullResponse += chunk.delta || "";
          if (chunk.type === "warning" && chunk.message) {
            if (!warnings.includes(chunk.message)) {
              warnings.push(chunk.message);
            }
          }
          if (chunk.type === "error" && !chunk.recoverable) {
            errorSent = true;
            hardErrorMessage = chunk.message || hardErrorMessage;
          }
          controller.enqueue(encode(formatNDJSONChunk(chunk)));
        }
        if (errorSent) {
          console.error("[chat] stream ended with an error chunk; persisting failure state");
          // No LLM response was produced — refund the reserved quota unit.
          await refundQuota();
          await convexClient.mutation(api.messages.createMessage, {
            conversationId: conversation._id,
            clientUUID: messageClientId,
            role: "user",
            content: prompt,
          });
          await convexClient.mutation(api.messages.createMessage, {
            conversationId: conversation._id,
            clientUUID: assistantClientId,
            role: "assistant",
            content: "",
            model,
            provider,
            warning:
              hardErrorMessage || "Something went wrong while answering.",
          });
          return;
        }
        controller.enqueue(encode(formatNDJSONDone()));
        doneSent = true;

        await convexClient.mutation(api.messages.createMessage, {
          conversationId: conversation._id,
          clientUUID: messageClientId,
          role: "user",
          content: prompt,
        });

        await convexClient.mutation(api.messages.createMessage, {
          conversationId: conversation._id,
          clientUUID: assistantClientId,
          role: "assistant",
          content: fullResponse,
          model,
          provider,
          warning:
            warnings.length > 0 ? warnings[warnings.length - 1] : undefined,
        });
      } catch (err: any) {
        if (doneSent) {
          console.error("Failed to persist chat messages:", err);
        } else {
          console.error("[chat] stream failed:", err?.message ?? err);
          controller.enqueue(
            encode(formatNDJSONError(toUserFacingError(err, "inference"))),
          );
          // No LLM response was produced — refund the reserved quota unit.
          await refundQuota();
          try {
            await convexClient.mutation(api.messages.createMessage, {
              conversationId: conversation._id,
              clientUUID: messageClientId,
              role: "user",
              content: prompt,
            });
            await convexClient.mutation(api.messages.createMessage, {
              conversationId: conversation._id,
              clientUUID: assistantClientId,
              role: "assistant",
              content: "",
              model,
              provider,
              warning: toUserFacingError(err, "inference"),
            });
          } catch (persistErr) {
            console.error("Failed to persist chat messages:", persistErr);
          }
        }
      } finally {
        convexClient.close();
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: NDJSON_HEADERS });
}
