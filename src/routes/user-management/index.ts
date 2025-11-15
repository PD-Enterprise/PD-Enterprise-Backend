import { Hono } from "hono";
import { eq } from "drizzle-orm";
import validator from "validator";
import { notesdb } from "../../db/cnotes";
import { user as noteUser } from "../../../drizzle/cnotes/schema";
import { db } from "../../db/users";
import { users } from "../../../drizzle/users/schema";
import { userExistsInMainDb } from "../../utils/userExistsInMainDb";
import { returnJson } from "../../utils/returnJson";

const usersRouter = new Hono();

usersRouter.post("/roles/get-role", async (c) => {
  const body = await c.req.json();
  const email = body.email;

  if (!email) {
    c.status(400);
    return c.json(returnJson(400, "Missing required fields", null, null));
  }

  const [success, error] = await userExistsInMainDb(email);
  if (error || !success) {
    return c.json(
      returnJson(401, "Unauthorized: Email does not exist.", null, null)
    );
  }

  try {
    const role = await db
      .select({ role: users.membership })
      .from(users)
      .where(eq(users.email, email));

    if (role[0].role == null || undefined || "") {
      try {
        const role = await db
          .update(users)
          .set({ membership: "tier-1" })
          .where(eq(users.email, email));

        return c.json(
          returnJson(200, "Role updated successfully", "tier-1", null)
        );
      } catch (error) {
        console.error(error);
        c.status(500);
        return c.json(
          returnJson(
            500,
            "An unexpected error occurred. Please try again later.",
            null,
            null
          )
        );
      }
    } else {
      return c.json(
        returnJson(200, "Role found successfully", role[0].role, null)
      );
    }
  } catch (error) {
    console.error(error);
    c.status(500);
    return c.json(
      returnJson(
        500,
        "An unexpected error occurred. Please try again later.",
        null,
        null
      )
    );
  }
});
usersRouter.post("/new-user", async (c) => {
  const body = await c.req.json();
  const name = body.name;
  const email = body.email;

  if (email) {
    c.status(400);
    return c.json(returnJson(400, "Missing required fields", null, null));
  }

  if (!validator.isEmail(email)) {
    c.status(400);
    return c.json(returnJson(400, "Invalid email format", null, null));
  }

  try {
    /*
      Main Database
    */
    const userIdList = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (userIdList.length > 0) {
      c.status(400);
      return c.json(returnJson(400, "User already exists", null, null));
    }

    const user = await db
      .insert(users)
      .values({ name, email, membership: "tier-1" })
      .returning({ id: users.id });

    /*
      Notes Database
    */
    const noteUserIdList = await notesdb
      .select({ id: noteUser.id })
      .from(noteUser)
      .where(eq(noteUser.email, email))
      .limit(1);

    if (noteUserIdList.length > 0) {
      c.status(400);
      return c.json(
        returnJson(400, "User already exists in notes", null, null)
      );
    }
    await notesdb.insert(noteUser).values({ email });

    return c.json(returnJson(200, "User created successfully", user[0], null));
  } catch (error) {
    console.error(error);
    c.status(500);
    return c.json(
      returnJson(
        500,
        "An unexpected error occurred. Please try again later.",
        null,
        null
      )
    );
  }
});

export default usersRouter;
