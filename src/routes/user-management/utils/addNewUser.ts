import { users } from "../../../../drizzle/users/schema";
import { userExistsInMainDb } from "../../../db/users/utils/userExistsInMainDb";
import { functionReturn } from "../../../utils/functionReturn";
import { userExistsInNotesDb } from "../../../db/cnotes/utils/userExistsInNoteDb";
import { user as noteUser } from "../../../../drizzle/cnotes/schema";

export async function addNewUserToMainDB(db: any, email: string, name: string) {
  const [success, error, id] = await userExistsInMainDb(db, email);
  if (error || !success) {
    const userId = await db
      .insert(users)
      .values({ name, email, membership: "tier-1" })
      .returning({ id: users.id });
    return userId;
  }
  return id;
}

export async function addNewUserToNotesDB(db: any, email: string) {
  const [success, error, id] = await userExistsInNotesDb(db, email);
  if (error || !success) {
    const userId = await db
      .insert(noteUser)
      .values({ email })
      .returning({ id: noteUser.id });
    return userId;
  }
  return id;
}
