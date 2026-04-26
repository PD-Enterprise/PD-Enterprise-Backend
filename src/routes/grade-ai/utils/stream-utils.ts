import type { StreamChunk } from "../routes/providers/types";

export function formatNDJSONChunk(chunk: StreamChunk): string {
  return JSON.stringify(chunk) + "\n";
}

export function formatNDJSONDone(): string {
  return JSON.stringify({ type: "done" }) + "\n";
}

export const NDJSON_HEADERS: Record<string, string> = {
  "Content-Type": "application/x-ndjson",
  "Cache-Control": "no-cache",
};
