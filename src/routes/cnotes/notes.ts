import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { createNotesDb } from "../../db/cnotes";
import { notes, academicLevel, user } from "@/drizzle/cnotes/schema";
import { userExistsInNotesDB } from "@/src/routes/user-management/utils/userExists";
import { returnJson } from "@/utils/returnJson";
import { AppVariables, Bindings } from "../../types";
import validator from "validator";

const notesRouter = new Hono<{ Bindings: Bindings, Variables: AppVariables }>();

/**
 * Get notes
 * POST /cnotes/notes
 * Requires: email
 * Returns: JSON
 */
notesRouter.get("/", async (c) => {
  const email = c.get("user").email;
  if (!email) {
    console.error("Email not provided");
    c.status(400);
    return c.json(returnJson(400, "Missing required fields", null, null));
  }
  if (!validator.isEmail(email)) {
    console.log("Invalid email format");
    c.status(400);
    return c.json(returnJson(400, "Invalid email format", null, null));
  }

  const notesdb = createNotesDb(c.env.CNOTES_DB_URL);
  const userId = await userExistsInNotesDB(notesdb, email);
  if (!userId || userId instanceof Error) {
    console.error(userId);
    c.status(401);
    return c.json(
      returnJson(401, "Unauthorized: Email does not exist.", null, null),
    );
  }

  try {
    const notesList = await notesdb
      .select({
        title: notes.title,
        slug: notes.slug,
        content: notes.content,
        dateCreated: notes.dateCreated,
        dateUpdated: notes.dateUpdated,
        topic: notes.topic,
        type: notes.type,
        visibility: notes.visibility,
        academicLevel: academicLevel.academicLevel,
        year: notes.year,
        language: notes.language,
        keywords: notes.keywords,
      })
      .from(notes)
      .innerJoin(academicLevel, eq(notes.academicLevel, academicLevel.id))
      .innerJoin(user, eq(notes.email, user.id))
      .where(eq(user.email, email));

    if (!notesList) {
      c.status(404);
      return c.json(returnJson(404, "Notes could not be loaded.", null, null));
    }

    return c.json(returnJson(200, "Notes found successfully", notesList, null));
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

export default notesRouter;
