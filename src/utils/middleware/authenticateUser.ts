import { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { returnJson } from "../returnJson";
import { decode } from "@auth/core/jwt";
import { AppVariables, Bindings, userObject } from "@/src/types";

export const authUser: MiddlewareHandler<{ Bindings: Bindings, Variables: AppVariables }> = async (c, next) => {
    const sessionToken = getCookie(c, "authjs.session-token") || getCookie(c, "__Secure-better-auth.session_token")
    if (!sessionToken) {
        c.status(401)
        return c.json(returnJson(401, "Unauthorized: No session token found", null, null), 401)
    }
    try {
        const decoded = await decode({
            token: sessionToken,
            secret: c.env.AUTH_SECRET!,
            salt: sessionToken.startsWith("__Secure")
                ? "__Secure-better-auth.session_token"
                : "authjs.session-token",
        })
        // console.log(decoded)
        if (!decoded?.email) {
            return c.json({ error: "Unauthorized: invalid session" }, 401)
        }
        c.set("user", decoded as userObject)
        await next()
    } catch (e) {
        console.error(e)
        c.status(401)
        return c.json(returnJson(401, "Unauthorized: Invalid session token", null, null), 401)
    }
}