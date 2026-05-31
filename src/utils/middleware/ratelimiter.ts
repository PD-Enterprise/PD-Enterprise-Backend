import rateLimit from "hono-rate-limit";

export function rateLimiter(limit: number = 20) {
  return rateLimit({
    windowMs: 60 * 1000, // 60,000 ms = 1 minute
    limit: limit, // 20 requests per minute (≈ 0.33 requests/sec)
    message: "Too many requests, please try again later.",
  });
}
