import { eq } from "drizzle-orm";
import { notesdb } from "../db/cnotes";
import { user as noteUser } from "../../drizzle/cnotes/schema";
import { functionReturn } from "./functionReturn";

export async function userExistsInNotesDb(email: string) {
  if (!email) {
    return functionReturn(false, true, "Email was not provided.");
  }

  try {
    const userIdList = await notesdb
      .select({ id: noteUser.id })
      .from(noteUser)
      .where(eq(noteUser.email, email))
      .limit(1);

    const userExists = userIdList.length > 0;

    if (userExists) {
      return functionReturn(userExists, false, "User found.");
    } else {
      return functionReturn(userExists, true, "User does not exist.");
    }
  } catch (error) {
    return functionReturn(
      false,
      true,
      "There was an error getting user from database."
    );
  }
}
