import { Hono } from "hono";
import { handleChat } from "./routes/chat-handler";
import { handleCreateThread, handleGetThreads, handleGetMessages, handleUpdateThreadTitle, handleDeleteThread } from "./routes/thread-handler";
import { returnJson } from "../../utils/returnJson";
import { modelList } from "./utils/modelList";
import { Bindings } from "../../types";
import { authUser } from "@/src/utils/middleware/authenticateUser";
import { userRateLimiter } from "@/src/utils/middleware/ratelimiter";

const aiRouter = new Hono<{ Bindings: Bindings }>();

// Per-user limits (keyed by email after auth; survive IP rotation).
// Coarse per-IP shield also runs globally in src/index.ts.
aiRouter.use("/chat", authUser, userRateLimiter(30));
aiRouter.use("/thread", authUser, userRateLimiter(20));
aiRouter.use("/thread/*", authUser, userRateLimiter(20));
aiRouter.use("/threads", authUser, userRateLimiter(30));
aiRouter.use("/messages/*", authUser, userRateLimiter(30));

aiRouter.get("/", (c) => {
  c.status(200);
  return c.html("<!DOCTYPE html><html><body><h1>This is the backend-service for Grade AI.</h1></body></html>");
});
/**
 * Chat with the model
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
aiRouter.post("/thread", handleCreateThread);
aiRouter.patch("/thread/:clientUUID", handleUpdateThreadTitle);
aiRouter.delete("/thread/:clientUUID", handleDeleteThread);
aiRouter.get("/threads", handleGetThreads);
aiRouter.get("/messages/:clientUUID", handleGetMessages);

/**
 * Get model list
 * GET /grade-ai/get-model-list
 */
aiRouter.get("/model-list", async (c) => {
  c.status(200);
  return c.json(returnJson(200, "success", modelList, null));
});

export default aiRouter;
