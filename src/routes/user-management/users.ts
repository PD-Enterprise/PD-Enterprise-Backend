import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { notesdb } from "../../db/cnotes";
import { user as noteUser } from "../../db/cnotes/schema";
import validator from "validator";
import { db } from "../../db/users";
import { users } from "../../db/users/schema";

const usersRouter = new Hono();

// Helper function to check user existence in the main users db
async function userExistsInMainDb(email: string) {
  const user = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return user.length > 0;
}

usersRouter.post("/users/roles/get-role", async (c) => {
  const body = await c.req.json();
  if (!body.email) {
    c.status(400);
    return c.json({
      status: 400,
      message: "Missing required fields",
      data: null,
      error: null,
    });
  }
  const email = body.email;
  // Auth check
  if (!(await userExistsInMainDb(email))) {
    c.status(401);
    return c.json({
      status: 401,
      message: "Unauthorized: Email does not exist.",
      data: null,
      error: null,
    });
  }
  try {
    const role = await db
      .select({ role: users.membership })
      .from(users)
      .where(eq(users.email, email));
    if (role[0].role == null || undefined || "") {
      const role = await db
        .update(users)
        .set({ membership: "tier-1" })
        .where(eq(users.email, email));
      return c.json({
        status: 200,
        message: "Role updated successfully",
        data: "tier-1",
        error: null,
      });
    } else {
      return c.json({
        status: 200,
        message: "Role found successfully",
        data: role[0].role,
        error: null,
      });
    }
  } catch (error) {
    console.error(error);
    c.status(500);
    return c.json({
      status: 500,
      message: "An unexpected error occurred. Please try again later.",
      data: null,
      error: null,
    });
  }
});
usersRouter.post("/user/new-user", async (c) => {
  const body = await c.req.json();
  if (!body.email) {
    c.status(400);
    return c.json({
      status: 400,
      message: "Missing required fields",
      data: null,
      error: null,
    });
  }
  const name = body.name;
  const email = body.email;

  // Validate email format
  if (!validator.isEmail(email)) {
    c.status(400);
    return c.json({
      status: 400,
      message: "Invalid email format",
      data: null,
      error: null,
    });
  }

  try {
    // Check if user exists in main users database
    const ifUserExists = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (ifUserExists.length > 0) {
      c.status(400);
      return c.json({
        status: 400,
        message: "User already exists",
        data: null,
        error: null,
      });
    }

    // Insert user into main users database
    const user = await db
      .insert(users)
      .values({ name, email, membership: "tier-1" })
      .returning({ id: users.id });

    // Check if user exists in notes database
    const existingNoteUser = await notesdb
      .select({ id: noteUser.id })
      .from(noteUser)
      .where(eq(noteUser.email, email))
      .limit(1);

    if (existingNoteUser.length > 0) {
      c.status(400);
      return c.json({
        status: 400,
        message: "User already exists in notes",
        data: null,
        error: null,
      });
    }
    await notesdb.insert(noteUser).values({ email });

    return c.json({
      status: 200,
      message: "User created successfully",
      data: user[0],
      error: null,
    });
  } catch (error) {
    console.error(error);
    c.status(500);
    return c.json({
      status: 500,
      message: "An unexpected error occurred. Please try again later.",
      data: null,
      error: null,
    });
  }
});
