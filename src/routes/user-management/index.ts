import { Hono } from "hono";
import validator from "validator";
import { createNotesDb } from "@/db/cnotes";
import { createUsersDb } from "@/db/users";
import { userExistsInMainDB } from "./utils/userExists";
import { returnJson } from "@/utils/returnJson";
import { api } from "../../../convex/_generated/api";
import { ConvexClient } from "convex/browser";
import { Bindings, AppVariables } from "../../types";
import { getUserRole } from "./utils/getUserRole";
import { addNewUserToMainDB } from "./utils/addNewUser";
import { addNewUserToNotesDB } from "./utils/addNewUser";
import { authUser } from "@/src/utils/middleware/authenticateUser";
import { userObjectSchema } from "@/src/zodSchema";

const usersRouter = new Hono<{ Bindings: Bindings, Variables: AppVariables }>();

// Middleware
usersRouter.use("/roles/*", authUser)
usersRouter.use("/academic-level", authUser)
usersRouter.use("/new-user", authUser)

/**
 * Get user role
 * GET /users/roles/get-role
 * Requires: email
 * Returns: JSON
 */
usersRouter.get("/roles/get-role", async (c) => {
  const email = c.get("user")?.email;
  if (!email) {
    c.status(400);
    return c.json(returnJson(400, "Missing required fields", null, null));
  }
  if (!validator.isEmail(email)) {
    console.log("Invalid email format");
    c.status(400);
    return c.json(returnJson(400, "Invalid email format", null, null));
  }
  const db = createUsersDb(c.env.DATABASE_URL);

  const userId = await userExistsInMainDB(db, email);
  if (!userId || userId instanceof Error) {
    console.error(userId);
    c.status(401);
    return c.json(
      returnJson(401, "Unauthorized: Email does not exist.", null, null),
    );
  }

  try {
    const role = await getUserRole(db, email);
    // console.log(role);
    if (role == "") {
      console.error("Role not found");
      c.status(500);
      return c.json(
        returnJson(
          500,
          "Role was not found and could not be updated in the database",
          null,
          null,
        ),
      );
    }
    c.status(200);
    return c.json(returnJson(200, "Role found successfully", role, null));
  } catch (error) {
    console.error(error);
    c.status(500);
    return c.json(
      returnJson(
        500,
        "An unexpected error occurred.",
        null,
        error,
      ),
    );
  }
});
/**
 * Create new user
 * POST /users/roles/new-user
 * Requires: email: string, name: string, avatarUrl: string
 * Returns: JSON
 */
usersRouter.post("/new-user", async (c) => {
  const user = c.get("user")
  if (user === undefined) {
    c.status(401)
    return c.json(returnJson(401, "Unauthorized: No session token found", null, null), 401)
  }
  const name = user.name;
  const email = user.email;
  const avatarUrl = user.picture;

  const notesdb = createNotesDb(c.env.CNOTES_DB_URL);
  const db = createUsersDb(c.env.DATABASE_URL);
  const convexClient = new ConvexClient(c.env.CONVEX_URL);

  try {
    /*
      Main Database
    */
    const userId = await addNewUserToMainDB(db, email, name);

    /*
      Notes Database
    */
    const noteUserId = await addNewUserToNotesDB(notesdb, email);

    // GradeAI Database
    const convexUserId = await convexClient.mutation(api.users.insertNewUser, {
      email,
      name,
      avatarUrl,
    });

    if (!userId || !noteUserId || !convexUserId) {
      c.status(500);
      return c.json(
        returnJson(
          500,
          "There was an issue creating the user in the databases",
          null,
          null,
        ),
      );
    }
    c.status(200);
    return c.json(returnJson(200, "User created successfully", userId, null));
  } catch (error) {
    console.error(error);
    c.status(500);
    return c.json(
      returnJson(
        500,
        "An unexpected error occurred. Please try again later.",
        null,
        null,
      ),
    );
  }
});
/**
 * Get user academic level
 * POST /grade-ai/get-user-academic-level
 * Requires: email
 * Returns: JSON
 */
usersRouter.get("/academic-level", async (c) => {
  const email = c.get("user")?.email;
  if (!email) {
    c.status(400);
    return c.json(returnJson(400, "Missing required fields", null, null));
  }
  if (!validator.isEmail(email)) {
    console.error("Invalid email format");
    c.status(400);
    return c.json(returnJson(400, "Invalid email format", null, null));
  }

  const convexClient = new ConvexClient(c.env.CONVEX_URL);
  try {
    const academicLevel = await convexClient.query(api.users.getAcademicLevel, { email });

    if (!academicLevel) {
      c.status(404);
      return c.json(returnJson(404, "Academic level not found", null, null));
    }

    c.status(200);
    return c.json(
      returnJson(
        200,
        "Successfully retrieved academic level",
        academicLevel,
        null,
      ),
    );
  } catch (error) {
    console.error(error);
    c.status(500);
    return c.json(
      returnJson(
        500,
        "An unexpected error occurred. Please try again later.",
        null,
        null,
      ),
    );
  }
});
/**
 * Update user academic level
 * POST /grade-ai/update-user-academic-level
 * Requires: email, academicLevel
 * Returns: JSON
 */
usersRouter.post("/academic-level", async (c) => {
  const body = await c.req.json();
  const email = c.get("user")?.email;
  const academicLevel = body.academicLevel;
  if (!email || !academicLevel) {
    c.status(400);
    return c.json(returnJson(400, "Missing required fields", null, null));
  }
  if (!validator.isEmail(email)) {
    console.error("Invalid email format");
    c.status(400);
    return c.json(returnJson(400, "Invalid email format", null, null));
  }

  const convexClient = new ConvexClient(c.env.CONVEX_URL);
  try {
    const academicLevel = await convexClient.mutation(
      api.users.updateAcademicLevel,
      {
        email: email,
        academicLevel: body.academicLevel,
      },
    );

    if (!academicLevel) {
      c.status(404);
      return c.json(
        returnJson(404, "Could not update academic level", null, null),
      );
    }

    c.status(200);
    return c.json(
      returnJson(
        200,
        "Successfully updated academic level",
        academicLevel,
        null,
      ),
    );
  } catch (error) {
    console.error(error);
    c.status(500);
    return c.json(
      returnJson(
        500,
        "An unexpected error occurred. Please try again later.",
        null,
        null,
      ),
    );
  }
});

export default usersRouter;
