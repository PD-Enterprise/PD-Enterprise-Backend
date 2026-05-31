import type { StreamChunk } from "../routes/providers/types";

export function formatNDJSONChunk(chunk: StreamChunk): string {
  return JSON.stringify(chunk) + "\n";
}

export function formatNDJSONDone(): string {
  return JSON.stringify({ type: "done" }) + "\n";
}

export function formatNDJSONError(error: string): string {
  return JSON.stringify({ type: "error", message: error }) + "\n";
}

export const NDJSON_HEADERS: Record<string, string> = {
  "Content-Type": "application/x-ndjson",
  "Cache-Control": "no-cache",
};
