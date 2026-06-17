import { Hono } from "hono";
import { createNotesDb } from "../../db/cnotes";
import { noteSchema } from "../../zodSchema";
import { notes, academicLevel } from "@/drizzle/cnotes/schema";
import { userExistsInNotesDB } from "@/src/routes/user-management/utils/userExists";
import { returnJson } from "@/utils/returnJson";
import { generateSlug } from "@/utils/generateSlug";
import { AppVariables, Bindings } from "../../types";
import { existingAcademicLevel } from "@/db/cnotes/utils/existingAcademicLevel";

const newNoteRouter = new Hono<{ Bindings: Bindings, Variables: AppVariables }>();

/**
 * Add note
 * POST /cnotes/new-note/:type
 * Requires: email, note
 * Returns: JSON
 */
newNoteRouter.post("/:type", async (c) => {
  const userObj = c.get("user")
  if (userObj === undefined) {
    c.status(401)
    return c.json(returnJson(401, "Unauthorized: No session token found", null, null), 401)
  }
  const type = c.req.param("type");
  const body = await c.req.json();
  const email = userObj.email;
  const result = noteSchema.safeParse(body.note);
  if (!result.success) {
    console.error(result.error);
    c.status(400);
    return c.json(returnJson(400, "Invalid input", null, result.error));
  }
  const note = result.data;
  if (!email || !note) {
    console.error("Email or note not provided");
    c.status(400);
    return c.json(returnJson(400, "Missing required fields", null, null));
  }
  const notesdb = createNotesDb(c.env.CNOTES_DB_URL);

  const userId = await userExistsInNotesDB(notesdb, email);
  if (userId instanceof Error) {
    console.error(userId);
    c.status(401);
    return c.json(
      returnJson(401, "Unauthorized: Email does not exist.", null, null),
    );
  }
  if (!userId) {
    console.error("User not found in database");
    c.status(404);
    return c.json(
      returnJson(404, "User not found in database", null, null),
    );
  }

  const academicLevelId = await existingAcademicLevel(notesdb, note.academicLevel);
  if (!academicLevelId || academicLevelId instanceof Error) {
    console.error(academicLevelId);
    c.status(400)
    return c.json(
      returnJson(400, "Invalid academic Level", null, null),
    );
  }

  try {
    const [inserted] = await notesdb
      .insert(notes)
      .values({
        title: note.title,
        slug: generateSlug(note.title),
        content: note.content,
        dateCreated: note.dateCreated,
        dateUpdated: new Date().toISOString(),
        email: userId,
        topic: note.topic,
        type: type,
        visibility: note.visibility,
        academicLevel: academicLevelId,
        year: note.year,
        language: note.language,
        keywords: note.keywords,
      })
      .returning({ insertedId: notes.noteId });
    return c.json(
      returnJson(200, "New note created successfully", inserted, null),
    );
  } catch (error) {
    console.error(error);
    c.status(500);
    return c.json(
      returnJson(
        500,
        "An unexpected error occurred.",
        null,
        null,
      ),
    );
  }
});

export default newNoteRouter;
