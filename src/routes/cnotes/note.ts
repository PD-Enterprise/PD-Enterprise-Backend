import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { createNotesDb } from "@/db/cnotes";
import { notes, academicLevel, user } from "@/drizzle/cnotes/schema";
import { userExistsInNotesDB } from "@/src/routes/user-management/utils/userExists";
import { returnJson } from "@/utils/returnJson";
import { noteSchema } from "../../zodSchema";
import { generateSlug } from "@/utils/generateSlug";
import { AppVariables, Bindings } from "../../types";
import validator from "validator";
import { existingAcademicLevel } from "@/src/db/cnotes/utils/existingAcademicLevel";

const noteRouter = new Hono<{ Bindings: Bindings, Variables: AppVariables }>();

/**
 * Get note
 * POST /cnotes/note/:slug
 * Requires: email, note
 * Returns: JSON
 */
noteRouter.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const email = c.get("user").email;
  if (!email) {
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
    const note = await notesdb
      .select({
        title: notes.title,
        slug: notes.slug,
        content: notes.content,
        dateCreated: notes.dateCreated,
        dateUpdated: notes.dateUpdated,
        topic: notes.topic,
        type: notes.type,
        visibility: notes.visibility,
        email: notes.email,
        academicLevel: academicLevel.academicLevel,
        year: notes.year,
        language: notes.language,
        keywords: notes.keywords,
      })
      .from(notes)
      .innerJoin(academicLevel, eq(notes.academicLevel, academicLevel.id))
      .where(eq(notes.slug, slug))
      .limit(1);

    if (!note.length) {
      c.status(404);
      return c.json(returnJson(404, "Note not found.", null, null));
    }

    if (note[0].visibility === "private" && note[0].email !== userId) {
      c.status(403);
      return c.json(
        returnJson(
          403,
          "You do not have permission to view this private note.",
          null,
          null,
        ),
      );
    }

    const { email: _email, ...safeNote } = note[0]
    return c.json(returnJson(200, "Successfully found note", [safeNote], null));
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
/**
 * Update note
 * POST /cnotes/note/:slug/update
 * Requires: email, note
 * Returns: JSON
 */
noteRouter.post("/:slug/update", async (c) => {
  const slug = c.req.param("slug");
  const body = await c.req.json();
  const email = c.get("user").email;
  const result = noteSchema.safeParse(body.note);
  if (!result.success) {
    console.log(result.error);
    c.status(400);
    return c.json(returnJson(400, "Invalid input", null, result.error));
  }
  const note = result.data
  if (!email || !note) {
    c.status(400);
    return c.json(returnJson(400, "Missing email or note data", null, null));
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

  const academicLevelId = await existingAcademicLevel(notesdb, note.academicLevel);
  if (!academicLevelId || academicLevelId instanceof Error) {
    console.error(academicLevelId);
    c.status(400)
    return c.json(
      returnJson(400, "Invalid academic Level", null, null),
    );
  }

  try {
    let newSlug = slug;
    const oldNote = await notesdb
      .select({ title: notes.title })
      .from(notes)
      .where(eq(notes.slug, slug))
      .limit(1);

    if (oldNote[0].title !== note.title) {
      newSlug = generateSlug(note.title);
    }

    const updated = await notesdb
      .update(notes)
      .set({
        title: note.title,
        slug: newSlug,
        content: note.content,
        dateCreated: note.dateCreated,
        dateUpdated: new Date().toISOString(),
        academicLevel: academicLevelId,
        topic: note.topic,
        visibility: note.visibility,
        year: note.year,
        language: note.language,
        keywords: note.keywords,
      })
      .where(and(eq(notes.slug, slug), eq(notes.email, userId)))
      .returning();

    if (!updated) {
      c.status(404);
      return c.json(
        returnJson(
          404,
          "Note could not be update.",
          null,
          null,
        ),
      );
    }

    return c.json(
      returnJson(200, "Note updated successfully", updated[0], null),
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
 * Delete note
 * DELETE /cnotes/note/:slug/delete
 * Requires: email
 * Returns: JSON
 */
noteRouter.delete("/:slug/delete", async (c) => {
  const slug = c.req.param("slug")
  const email = c.get("user").email;
  if (!email) {
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
    const deleted = await notesdb
      .delete(notes)
      .where(and(eq(notes.slug, slug), eq(notes.email, userId)))
      .returning({ id: notes.noteId });

    if (!deleted) {
      c.status(404);
      return c.json(
        returnJson(
          404,
          "Note not found to be deleted.",
          null,
          null,
        ),
      );
    }

    return c.json(
      returnJson(200, "Note deleted successfully", deleted, null),
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

export default noteRouter;
