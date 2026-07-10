import { Context } from "hono";
import { ConvexClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { returnJson } from "@/src/utils/returnJson";

export async function handleCreateThread(c: Context): Promise<Response> {
  const email = c.get("user")?.email;
  if (!email) {
    c.status(401);
    return c.json(returnJson(401, "Unauthorized", null, null));
  }

  const body = await c.req.json();
  const { title, clientUUID } = body;

  if (!title || !clientUUID) {
    c.status(400);
    return c.json(
      returnJson(400, "title and clientUUID are required", null, null),
    );
  }

  const convexClient = new ConvexClient(c.env.CONVEX_URL);

  try {
    const user = await convexClient.query(api.users.getUserByEmail, { email });
    if (!user) {
      c.status(404);
      return c.json(returnJson(404, "User not found", null, null));
    }

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
    return c.json(returnJson(500, "Failed to create thread", null, err.message));
  } finally {
    convexClient.close();
  }
}
