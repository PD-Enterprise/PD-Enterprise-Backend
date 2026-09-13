import { MiddlewareHandler } from "hono";

type Bucket = { count: number; resetTime: number };

/**
 * Non-spoofable client IP extraction.
 *
 * ONLY `cf-connecting-ip` is trusted — it is set/overwritten by the
 * Cloudflare edge, so a client cannot forge it. `x-forwarded-for` and
 * `x-real-ip` are deliberately IGNORED: off-CF any client can send arbitrary
 * values, and each unique value would get its own rate-limit bucket (full
 * bypass). When the header is absent (local dev, direct origin hits), all
 * requests share the single "unknown" bucket — fail-closed by design.
 */
export function getSecureClientIp(c: {
  req: { header: (name: string) => string | undefined };
}): string {
  return c.req.header("cf-connecting-ip")?.trim() || "unknown";
}

function createLimiter(
  limit: number,
  windowMs: number,
  keyFn: (c: any) => string,
): MiddlewareHandler {
  const store = new Map<string, Bucket>();
  return async (c, next) => {
    const key = keyFn(c);
    const now = Date.now();
    const record = store.get(key);
    if (!record || now > record.resetTime) {
      // Opportunistic cleanup to bound memory on long-lived isolates.
      if (store.size > 5000) {
        for (const [k, v] of store) {
          if (now > v.resetTime) store.delete(k);
        }
      }
      store.set(key, { count: 1, resetTime: now + windowMs });
      await next();
      return;
    }
    if (record.count >= limit) {
      return c.text("Too many requests, please try again later.", 429);
    }
    record.count++;
    await next();
  };
}

/**
 * Coarse per-IP limiter. Use in `src/index.ts` (runs before auth, so no
 * user identity is available yet). Must be keyed by secure IP only.
 */
export function rateLimiter(
  limit: number = 20,
  windowMs: number = 60 * 1000,
): MiddlewareHandler {
  return createLimiter(limit, windowMs, (c) => `ip:${getSecureClientIp(c)}`);
}

/**
 * Per-user limiter. Use INSIDE routers AFTER `authUser` so `c.get("user")`
 * is populated. Authenticated requests are keyed by email (survives IP
 * rotation); unauthenticated fall back to secure IP.
 */
export function userRateLimiter(
  limit: number = 30,
  windowMs: number = 60 * 1000,
): MiddlewareHandler {
  return createLimiter(
    limit,
    windowMs,
    (c) => `user:${c.get("user")?.email ?? getSecureClientIp(c)}`,
  );
}
