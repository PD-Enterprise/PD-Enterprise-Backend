import { Context, Hono } from "hono";
import { handleChat } from "./routes/chat-handler";
import { returnJson } from "../../utils/returnJson";
import { modelList } from "./utils/modelList";
import { Bindings } from "../../types";
import { ConvexClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";

const aiRouter = new Hono<{ Bindings: Bindings }>();

aiRouter.get("/", (c) => {
  c.status(200);
  return c.html("<!DOCTYPE html><html><body><h1>This is the backend-service for Grade AI.</h1></body></html>");
});
/**
 * POST /grade-ai/chat
 *
 * Body: {
 *   prompt:         string        - the user's message
 *   provider:       "groq" | "gemini"
 *   model:          string        - exact model name for the provider
 *   mode:           "socratic" | "direct"
 *   history:        ChatMessage[] - full conversation history from client
 *   conversationId: string        - used by client to reconcile the response
 *   email: string                 - user email
 * }
 *
 * Response: text/event-stream (SSE)
 *   delta chunks:  data: {"type":"delta","delta":"..."}
 *   usage chunk:   data: {"type":"usage","usage":{...}}  ← last chunk before DONE
 *   done:          data: [DONE]
 *   on error:      event: error\ndata: {"message":"..."}
 */
aiRouter.post("/chat", handleChat);

aiRouter.get("/get-model-list", async (c) => {
  return c.json(returnJson(200, "success", modelList, null));
});

aiRouter.post("/get-user-academic-level", async (c: Context) => {
  const convexClient = new ConvexClient(c.env.CONVEX_URL);

  const body = await c.req.json().catch(() => null);
  if (!body || body.email == null) {
    c.status(400);
    return c.json(returnJson(400, "Missing required fields", null, null));
  }
  const email = body.email;
  if (email == "") {
    c.status(400);
    return c.json(returnJson(400, "Missing required fields", null, null));
  }
  try {
    const academicLevel = await convexClient.query(api.users.getAcademicLevel, {
      email: body.email,
    });

    if (!academicLevel) {
      c.status(404);
      return c.json(returnJson(404, "Academic level not found", null, null));
    }

    c.status(200);
    return c.json(
      returnJson(
        200,
        "Successfully retrieved academic level",
        academicLevel,
        null,
      ),
    );
  } catch (error) {
    console.error(error);
    c.status(500);
    return c.json(
      returnJson(
        500,
        "An unexpected error occurred. Please try again later.",
        null,
        null,
      ),
    );
  }
});

aiRouter.post("/update-user-academic-level", async (c: Context) => {
  const convexClient = new ConvexClient(c.env.CONVEX_URL);

  const body = await c.req.json().catch(() => null);
  const email = body.email;
  const academicLevel = body.academicLevel;
  if (email == "" || academicLevel == null) {
    c.status(400);
    return c.json(returnJson(400, "Missing required fields", null, null));
  }

  try {
    const academicLevel = await convexClient.mutation(
      api.users.updateAcademicLevel,
      {
        email: body.email,
        academicLevel: body.academicLevel,
      },
    );

    if (!academicLevel) {
      c.status(404);
      return c.json(
        returnJson(404, "Could not update academic level", null, null),
      );
    }

    c.status(200);
    return c.json(
      returnJson(
        200,
        "Successfully updated academic level",
        academicLevel,
        null,
      ),
    );
  } catch (error) {
    console.error(error);
    c.status(500);
    return c.json(
      returnJson(
        500,
        "An unexpected error occurred. Please try again later.",
        null,
        null,
      ),
    );
  }
});

export default aiRouter;
