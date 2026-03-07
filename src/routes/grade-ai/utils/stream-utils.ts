import type { StreamChunk } from "../routes/providers/types";

export function formatSSEChunk(chunk: StreamChunk): string {
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

export function formatSSEDone(): string {
  return `data: [DONE]\n\n`;
}

export const SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keel-alive",
  "X-Accel-Buffering": "no",
};
