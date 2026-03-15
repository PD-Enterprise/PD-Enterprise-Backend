import { Hono } from "hono";
import { handleChat } from "./routes/chat-handler";
import { returnJson } from "../../utils/returnJson";
import { modelList } from "./utils/modelList";
import { Bindings } from "../../types";

const aiRouter = new Hono<{ Bindings: Bindings }>();

/**
 * POST /grade-ai/chat
 *
 * Body: {
 *   prompt:         string        — the user's message
 *   provider:       "groq" | "openrouter" | "gemini"
 *   model:          string        — exact model name for the provider
 *   mode:           "socratic" | "direct"
 *   history:        ChatMessage[] — full conversation history from client
 *   conversationId: string        — used by client to reconcile the response
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

export default aiRouter;
