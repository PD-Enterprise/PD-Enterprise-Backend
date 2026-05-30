import { eq } from "drizzle-orm";
import { users } from "@/drizzle/users/schema";
import { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { user as noteUser } from "@/drizzle/cnotes/schema";

export async function userExistsInMainDB(db: NeonHttpDatabase, email: string) {
  try {
    const userId = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    const userExists = userId.length > 0;

    return userExists ? userId[0].id : new Error("User does not exist.");
  } catch (error) {
    return new Error("There was an error getting user from database.");
  }
}

export async function userExistsInNotesDB(db: NeonHttpDatabase, email: string) {
  try {
    const userId = await db
      .select({ id: noteUser.id })
      .from(noteUser)
      .where(eq(noteUser.email, email))
      .limit(1);
    const userExists = userId.length > 0;

    return userExists ? userId[0].id : new Error("User does not exist.");
  } catch (error) {
    return new Error("There was an error getting user from database.");
  }
}
