import { eq } from "drizzle-orm";
import { db } from "../db/users";
import { users } from "../../drizzle/users/schema";
import { functionReturn } from "./functionReturn";

export async function userExistsInMainDb(email: string) {
  if (!email) {
    return functionReturn(false, true, "Email was not provided.");
  }

  try {
    const userIdList = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
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
