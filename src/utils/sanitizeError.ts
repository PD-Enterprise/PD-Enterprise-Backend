/**
 * Convert any thrown error into a safe, user-facing message.
 *
 * Never returns raw `err.message` / stack traces / provider payloads to the
 * client. Raw details must only go to server logs (console.error / Sentry).
 *
 * The returned strings are drawn from a fixed allowlist so the frontend
 * always receives a proper, non-critical error message for failed tool calls
 * and inference failures.
 */

const BUSY_MESSAGE =
  "The AI service is busy right now. Please wait a moment and try again.";
const UNAVAILABLE_MESSAGE =
  "The AI service is temporarily unavailable. Please try again later.";
const CONNECTION_MESSAGE =
  "Unable to reach the AI service. Please check your connection and try again.";
const MODEL_MESSAGE =
  "The selected model is currently unavailable. Please try a different model.";
const SEARCH_UNAVAILABLE_MESSAGE =
  "Web search is temporarily unavailable, so the answer may not include the latest information.";
const SEARCH_UNPARSEABLE_MESSAGE =
  "The search tool couldn't understand the request, so the answer may not include the latest information.";
const TOOL_FAILED_MESSAGE =
  "The assistant had trouble using its search tool and answered without live results.";
const GENERIC_MESSAGE =
  "Something went wrong while generating the response. Please try again.";

function rawText(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const anyErr = err as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof anyErr.message === "string") parts.push(anyErr.message);
    if (typeof anyErr.code === "string") parts.push(anyErr.code);
    const nested = anyErr.error;
    if (nested && typeof nested === "object") {
      const n = nested as Record<string, unknown>;
      if (typeof n.message === "string") parts.push(n.message);
      if (typeof n.code === "string") parts.push(n.code);
      if (typeof n.type === "string") parts.push(n.type);
    }
    const status = (anyErr.status ?? anyErr.statusCode) as unknown;
    if (typeof status === "number") parts.push(`status ${status}`);
    return parts.join(" ").toLowerCase();
  }
  return "";
}

export function toUserFacingError(
  err: unknown,
  context: "inference" | "web_search" | "tool" | "ocr" | "generic" = "inference",
): string {
  const raw = rawText(err);

  // Rate limits / capacity — safe to tell the user to retry.
  if (
    raw.includes("429") ||
    raw.includes("rate_limit") ||
    raw.includes("rate limit") ||
    raw.includes("quota") ||
    raw.includes("capacity") ||
    raw.includes("overloaded") ||
    raw.includes("too many requests")
  ) {
    return BUSY_MESSAGE;
  }

  // Auth / config problems — never reveal keys, provider names, or env vars.
  if (
    raw.includes("401") ||
    raw.includes("403") ||
    raw.includes("api_key") ||
    raw.includes("api key") ||
    raw.includes("unauthorized") ||
    raw.includes("invalid_api_key") ||
    raw.includes("authentication") ||
    raw.includes("missing or empty")
  ) {
    return UNAVAILABLE_MESSAGE;
  }

  // Model / provider routing issues.
  if (
    raw.includes("model_not_found") ||
    raw.includes("model not found") ||
    raw.includes("unknown provider") ||
    raw.includes("does not exist") ||
    raw.includes("404")
  ) {
    return MODEL_MESSAGE;
  }

  // Network issues.
  if (
    raw.includes("fetch failed") ||
    raw.includes("econn") ||
    raw.includes("etimedout") ||
    raw.includes("timeout") ||
    raw.includes("network") ||
    raw.includes("socket") ||
    raw.includes("enotfound") ||
    raw.includes("503") ||
    raw.includes("502") ||
    raw.includes("bad gateway") ||
    raw.includes("service unavailable")
  ) {
    return CONNECTION_MESSAGE;
  }

  // Context-specific fallbacks for tool calls.
  if (context === "web_search") return SEARCH_UNAVAILABLE_MESSAGE;
  if (context === "tool") return TOOL_FAILED_MESSAGE;
  if (context === "ocr")
    return "Unable to process the image right now. Please try again later.";

  // Tool-use / function-call failures from the model itself.
  if (
    raw.includes("tool_use_failed") ||
    raw.includes("failed to call a function") ||
    raw.includes("function call") ||
    raw.includes("tool call") ||
    raw.includes("web_search") ||
    raw.includes("tavily") ||
    raw.includes("google_search")
  ) {
    return TOOL_FAILED_MESSAGE;
  }

  return GENERIC_MESSAGE;
}

export function webSearchUnavailableMessage(): string {
  return SEARCH_UNAVAILABLE_MESSAGE;
}

export function webSearchUnparseableMessage(): string {
  return SEARCH_UNPARSEABLE_MESSAGE;
}
