import { eq } from "drizzle-orm";
import { user as noteUser } from "../../../../drizzle/cnotes/schema";
import { functionReturn } from "../../../utils/functionReturn";

export async function userExistsInNotesDb(db: any, email: string) {
  try {
    const userIdList = await db
      .select({ id: noteUser.id })
      .from(noteUser)
      .where(eq(noteUser.email, email))
      .limit(1);
    const userExists = userIdList.length > 0;

    return functionReturn(
      userExists,
      userExists ? false : true,
      userExists ? "User found." : "User does not exist.",
      userIdList[0].id,
      null,
    );
  } catch (error) {
    return functionReturn(
      false,
      true,
      "There was an error getting user from database.",
    );
  }
}
