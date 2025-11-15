import { eq } from "drizzle-orm";
import { notesdb } from "../db/cnotes";
import { user as noteUser } from "../../drizzle/cnotes/schema";

export async function userExistsInNotesDb(email: string) {
  const existing = await notesdb
    .select({ id: noteUser.id })
    .from(noteUser)
    .where(eq(noteUser.email, email))
    .limit(1);

  return existing.length > 0;
}
