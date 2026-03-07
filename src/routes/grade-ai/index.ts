import { Hono } from "hono";
import { handleChat } from "./routes/chat-handler";

const aiRouter = new Hono();

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

export default aiRouter;
