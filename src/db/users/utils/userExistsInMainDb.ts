import { eq } from "drizzle-orm";
import { users } from "../../../../drizzle/users/schema";
import { functionReturn } from "../../../utils/functionReturn";
import { NeonHttpDatabase } from "drizzle-orm/neon-http";

export async function userExistsInMainDb(db: NeonHttpDatabase, email: string) {
  try {
    const userIdList = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
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
