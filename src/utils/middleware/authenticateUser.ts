import { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { decode } from "@auth/core/jwt";
import { AppVariables, Bindings, userObject } from "@/src/types";

async function decodeSession(c: any): Promise<userObject | undefined> {
  const secureToken = getCookie(c, "__Secure-authjs.session-token");
  const normalToken = getCookie(c, "authjs.session-token");

  const sessionToken = secureToken ?? normalToken;
  if (sessionToken == undefined) {
    return undefined;
  }
  const salt = secureToken
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
  const decoded = await decode({
    token: sessionToken,
    secret: c.env.AUTH_SECRET!,
    salt: salt,
  });
  if (!(decoded as any)?.email) {
    return undefined;
  }
  return decoded as userObject;
}

/**
 * Strict authentication: fail-CLOSED. Missing/invalid sessions get an
 * immediate 401 and the handler never runs. Use for every route that
 * requires a user — never rely on handlers to re-check.
 */
export const authUser: MiddlewareHandler<{
  Bindings: Bindings;
  Variables: AppVariables;
}> = async (c, next) => {
  let user: userObject | undefined;
  try {
    user = await decodeSession(c);
  } catch (e) {
    console.error("[authUser] decode threw error:", e);
    return c.json({ error: "Unauthorized: invalid session" }, 401);
  }
  if (!user?.email) {
    return c.json({ error: "Unauthorized: invalid session" }, 401);
  }
  c.set("user", user);
  await next();
};

/**
 * Lenient authentication for routes with a public branch (currently only
 * GET /cnotes/note/:slug, which serves public notes anonymously). Populates
 * `c.get("user")` when the session is valid, otherwise sets undefined and
 * lets the handler decide (e.g. serve public content or 401 for private).
 */
export const authUserOptional: MiddlewareHandler<{
  Bindings: Bindings;
  Variables: AppVariables;
}> = async (c, next) => {
  try {
    c.set("user", await decodeSession(c));
  } catch (e) {
    console.error("[authUserOptional] decode threw error:", e);
    c.set("user", undefined);
  }
  await next();
};
