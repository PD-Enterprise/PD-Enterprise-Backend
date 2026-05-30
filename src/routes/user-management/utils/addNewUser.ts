import { users } from "@/drizzle/users/schema";
import { userExistsInMainDB, userExistsInNotesDB } from "./userExists";
import { user as noteUser } from "@/drizzle/cnotes/schema";

export async function addNewUserToMainDB(db: any, email: string, name: string) {
  const userId = await userExistsInMainDB(db, email);
  if (!userId || userId instanceof Error) {
    const userId = await db
      .insert(users)
      .values({ name, email, membership: "tier-1" })
      .returning({ id: users.id });
    return userId;
  }
  return userId;
}

export async function addNewUserToNotesDB(db: any, email: string) {
  const userId = await userExistsInNotesDB(db, email);
  if (!userId || userId instanceof Error) {
    const userId = await db
      .insert(noteUser)
      .values({ email })
      .returning({ id: noteUser.id });
    return userId;
  }
  return userId;
}
