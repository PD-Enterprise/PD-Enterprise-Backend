import { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { decode } from "@auth/core/jwt";
import { AppVariables, Bindings, userObject } from "@/src/types";

export const authUser: MiddlewareHandler<{ Bindings: Bindings, Variables: AppVariables }> = async (c, next) => {
    const secureToken = getCookie(c, "__Secure-authjs.session-token")
    const normalToken = getCookie(c, "authjs.session-token")

    const sessionToken = secureToken ?? normalToken
    if (sessionToken == undefined) {
        c.set("user", undefined)
        await next()
    }
    const salt = secureToken
        ? "__Secure-authjs.session-token"
        : "authjs.session-token"
    try {
        const decoded = await decode({
            token: sessionToken,
            secret: c.env.AUTH_SECRET!,
            salt: salt,
        })
        if (!decoded?.email) {
            console.error("[authUser] no email in decoded token")
            return c.json({ error: "Unauthorized: invalid session" }, 401)
        }
        c.set("user", decoded as userObject)
        await next()
    } catch (e) {
        console.error("[authUser] decode threw error:", e)
        c.set("user", undefined)
        await next()
    }
}