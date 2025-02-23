import { db } from "../db/users"
import { users } from "../db/users/schema"
import { eq } from "drizzle-orm"

async function checkUserExits(email: string) {
    const checkUser = await db.select().from(users).where(eq(users.email, email))
    if (checkUser.length > 0) {
        return true
    } else {
        return false
    }
}

export { checkUserExits }