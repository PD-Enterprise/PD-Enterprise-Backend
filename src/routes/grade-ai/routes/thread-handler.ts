import { Context } from "hono";
import { ConvexClient } from "convex/browser";
import Groq from "groq-sdk";
import { api } from "@/convex/_generated/api";
import { returnJson } from "@/src/utils/returnJson";

async function generateTitle(prompt: string, apiKey: string): Promise<string> {
  const MAX_PROMPT_LENGTH = 500;
  const truncatedPrompt =
    prompt.length > MAX_PROMPT_LENGTH
      ? prompt.slice(0, MAX_PROMPT_LENGTH).trim()
      : prompt;
  const client = new Groq({ apiKey });
  try {
    const completion = await client.chat.completions.create({
      model: "qwen/qwen3.6-27b",
      // A ≤5-word title needs only a handful of tokens — cap output so the
      // request stays under the org's output-tokens-per-minute limit.
      // The model reasons in <think> blocks by default, which would eat the
      // whole budget before any title is produced — disable reasoning so the
      // output is just the title.
      max_tokens: 30,
      temperature: 0,
      reasoning_format: "hidden",
      reasoning_effort: "none",
      messages: [
        {
          role: "user",
          content: `Generate a concise title (5 words or fewer) for a conversation based on the user's first message. Return only the title, nothing else.\n\nUser's first message: ${truncatedPrompt}`,
        },
      ],
    });
    const title = completion.choices[0]?.message?.content?.trim() || "";
    // Classification models may wrap their reasoning in <think> blocks — strip them.
    const cleaned = title
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/<\/?think>/gi, "")
      .trim();
    return cleaned || prompt.split(/\s+/).slice(0, 5).join(" ");
  } catch (err) {
    console.error("[generateTitle] error:", err);
    return prompt.split(/\s+/).slice(0, 5).join(" ");
  }
}

export async function handleCreateThread(c: Context): Promise<Response> {
  const email = c.get("user")?.email;
  if (!email) {
    c.status(401);
    return c.json(returnJson(401, "Unauthorized", null, null));
  }

  const body = await c.req.json();
  const { prompt, clientUUID } = body;

  if (!prompt || !clientUUID) {
    c.status(400);
    return c.json(
      returnJson(400, "prompt and clientUUID are required", null, null),
    );
  }

  const convexClient = new ConvexClient(c.env.CONVEX_URL);

  try {
    const user = await convexClient.query(api.users.getUserByEmail, { email });
    if (!user) {
      c.status(404);
      return c.json(returnJson(404, "User not found", null, null));
    }

    const existing = await convexClient.query(
      api.conversations.getConversationByClientUUID,
      { clientUUID },
    );

    if (existing) {
      return c.json(
        returnJson(200, "Thread created", {
          conversationId: existing._id,
          clientUUID,
          title: existing.title,
        }, null),
      );
    }

    const title = await generateTitle(prompt, c.env.GROQ_API_KEY);

    const conversationId = await convexClient.mutation(
      api.conversations.createConversation,
      {
        userId: user._id,
        title,
        clientUUID,
      },
    );

    return c.json(
      returnJson(201, "Thread created", { conversationId, clientUUID, title }, null),
    );
  } catch (err: any) {
    console.error("[createThread] error:", err);
    c.status(500);
    return c.json(returnJson(500, "Failed to create thread", null, null));
  } finally {
    convexClient.close();
  }
}

export async function handleGetThreads(c: Context): Promise<Response> {
  const email = c.get("user")?.email;
  if (!email) {
    c.status(401);
    return c.json(returnJson(401, "Unauthorized", null, null));
  }

  const convexClient = new ConvexClient(c.env.CONVEX_URL);

  try {
    const user = await convexClient.query(api.users.getUserByEmail, { email });
    if (!user) {
      c.status(404);
      return c.json(returnJson(404, "User not found", null, null));
    }

    const conversations = await convexClient.query(
      api.conversations.getConversationsByUser,
      { userId: user._id },
    );

    return c.json(
      returnJson(200, "Threads retrieved", conversations, null),
    );
  } catch (err: any) {
    console.error("[getThreads] error:", err);
    c.status(500);
    return c.json(returnJson(500, "Failed to get threads", null, null));
  } finally {
    convexClient.close();
  }
}

export async function handleGetMessages(c: Context): Promise<Response> {
  const email = c.get("user")?.email;
  if (!email) {
    c.status(401);
    return c.json(returnJson(401, "Unauthorized", null, null));
  }

  const clientUUID = c.req.param("clientUUID");
  if (!clientUUID) {
    c.status(400);
    return c.json(returnJson(400, "clientUUID is required", null, null));
  }

  const convexClient = new ConvexClient(c.env.CONVEX_URL);

  try {
    const user = await convexClient.query(api.users.getUserByEmail, { email });
    if (!user) {
      c.status(404);
      return c.json(returnJson(404, "User not found", null, null));
    }

    const conversation = await convexClient.query(
      api.conversations.getConversationByClientUUID,
      { clientUUID },
    );
    if (!conversation) {
      c.status(404);
      return c.json(returnJson(404, "Thread not found", null, null));
    }
    if (conversation.userId !== user._id) {
      c.status(403);
      return c.json(returnJson(403, "Forbidden", null, null));
    }

    const messages = await convexClient.query(
      api.messages.getMessagesByConversation,
      { conversationId: conversation._id },
    );

    const sortedMessages = [...messages].sort((a: any, b: any) => a.createdAt - b.createdAt);

    return c.json(
      returnJson(200, "Messages retrieved", { messages: sortedMessages, conversation }, null),
    );
  } catch (err: any) {
    console.error("[getMessages] error:", err);
    c.status(500);
    return c.json(returnJson(500, "Failed to get messages", null, null));
  } finally {
    convexClient.close();
  }
}

export async function handleUpdateThreadTitle(c: Context): Promise<Response> {
  const email = c.get("user")?.email;
  if (!email) {
    c.status(401);
    return c.json(returnJson(401, "Unauthorized", null, null));
  }

  const clientUUID = c.req.param("clientUUID");
  if (!clientUUID) {
    c.status(400);
    return c.json(returnJson(400, "clientUUID is required", null, null));
  }

  const body = await c.req.json().catch(() => null);
  const rawTitle = typeof body?.title === "string" ? body.title.trim() : "";
  const regenerate = body?.regenerate === true;
  const rawPrompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";

  if (!regenerate && !rawTitle) {
    c.status(400);
    return c.json(
      returnJson(400, "title or regenerate field is required", null, null),
    );
  }
  if (rawTitle.length > 255) {
    c.status(400);
    return c.json(
      returnJson(400, "title must be 255 characters or fewer", null, null),
    );
  }

  const convexClient = new ConvexClient(c.env.CONVEX_URL);

  try {
    const user = await convexClient.query(api.users.getUserByEmail, { email });
    if (!user) {
      c.status(404);
      return c.json(returnJson(404, "User not found", null, null));
    }

    const conversation = await convexClient.query(
      api.conversations.getConversationByClientUUID,
      { clientUUID },
    );
    if (!conversation) {
      c.status(404);
      return c.json(returnJson(404, "Thread not found", null, null));
    }
    if (conversation.userId !== user._id) {
      c.status(403);
      return c.json(returnJson(403, "Forbidden", null, null));
    }

    let title = rawTitle;
    if (regenerate) {
      let prompt = rawPrompt;
      if (!prompt) {
        const messages = await convexClient.query(
          api.messages.getMessagesByConversation,
          { conversationId: conversation._id },
        );
        const firstUserMessage = (messages as any[]).find(
          (m) => m.role === "user" && m.content?.trim(),
        );
        if (!firstUserMessage) {
          c.status(400);
          return c.json(
            returnJson(400, "No user message to generate a title from", null, null),
          );
        }
        prompt = firstUserMessage.content.trim();
      }
      title = await generateTitle(prompt, c.env.GROQ_API_KEY);
    }

    await convexClient.mutation(api.conversations.updateConversationTitle, {
      conversationId: conversation._id,
      title,
    });

    return c.json(
      returnJson(200, "Thread title updated", { clientUUID, conversationId: conversation._id, title }, null),
    );
  } catch (err: any) {
    console.error("[updateThreadTitle] error:", err);
    c.status(500);
    return c.json(returnJson(500, "Failed to update thread title", null, null));
  } finally {
    convexClient.close();
  }
}

export async function handleDeleteThread(c: Context): Promise<Response> {
  const email = c.get("user")?.email;
  if (!email) {
    c.status(401);
    return c.json(returnJson(401, "Unauthorized", null, null));
  }

  const clientUUID = c.req.param("clientUUID");
  if (!clientUUID) {
    c.status(400);
    return c.json(returnJson(400, "clientUUID is required", null, null));
  }

  const convexClient = new ConvexClient(c.env.CONVEX_URL);

  try {
    const user = await convexClient.query(api.users.getUserByEmail, { email });
    if (!user) {
      c.status(404);
      return c.json(returnJson(404, "User not found", null, null));
    }

    const conversation = await convexClient.query(
      api.conversations.getConversationByClientUUID,
      { clientUUID },
    );
    if (!conversation) {
      c.status(404);
      return c.json(returnJson(404, "Thread not found", null, null));
    }
    if (conversation.userId !== user._id) {
      c.status(403);
      return c.json(returnJson(403, "Forbidden", null, null));
    }

    await convexClient.mutation(api.conversations.deleteConversation, {
      conversationId: conversation._id,
    });

    return c.json(
      returnJson(200, "Thread deleted", { clientUUID, conversationId: conversation._id }, null),
    );
  } catch (err: any) {
    console.error("[deleteThread] error:", err);
    c.status(500);
    return c.json(returnJson(500, "Failed to delete thread", null, null));
  } finally {
    convexClient.close();
  }
}
