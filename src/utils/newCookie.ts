import * as cookie from "cookie"
import { v4 as uuidv4 } from 'uuid'

export function newCookie(name: string) {
    const cookieId = uuidv4()
    const headers = {
        "Set-cookie": cookie.serialize(name, cookieId, {
            httpOnly: true,
            secure: true,
            sameSite: "strict",
            path: "/",
            maxAge: 60 * 60 * 24 * 30
        })
    }
    return headers
}