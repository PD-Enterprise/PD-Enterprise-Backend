import { Context } from "hono";
import { ConvexClient } from "convex/browser";
import Groq from "groq-sdk";
import { api } from "@/convex/_generated/api";
import { returnJson } from "@/src/utils/returnJson";

async function generateTitle(prompt: string, apiKey: string): Promise<string> {
  const client = new Groq({ apiKey });
  try {
    const completion = await client.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content:
            "Generate a concise title (5 words or fewer) for a conversation based on the user's first message. Return only the title, nothing else.",
        },
        { role: "user", content: prompt },
      ],
    });
    const title = completion.choices[0]?.message?.content?.trim() || "";
    return title || prompt.split(/\s+/).slice(0, 5).join(" ");
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
      returnJson(200, "Thread created", { conversationId, clientUUID, title }, null),
    );
  } catch (err: any) {
    console.error("[createThread] error:", err);
    c.status(500);
    return c.json(returnJson(500, "Failed to create thread", null, err.message));
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
    return c.json(returnJson(500, "Failed to get threads", null, err.message));
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
    return c.json(returnJson(500, "Failed to get messages", null, err.message));
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
    return c.json(returnJson(500, "Failed to delete thread", null, err.message));
  } finally {
    convexClient.close();
  }
}
