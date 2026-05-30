import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { createNotesDb } from "@/db/cnotes";
import { notes, academicLevel, user } from "@/drizzle/cnotes/schema";
import { userExistsInNotesDB } from "@/src/routes/user-management/utils/userExists";
import { returnJson } from "@/utils/returnJson";
import { noteSchema } from "../../zodSchema";
import { generateSlug } from "@/utils/generateSlug";
import { Bindings } from "../../types";
import validator from "validator";

const noteRouter = new Hono<{ Bindings: Bindings }>();

/**
 * POST /cnotes/note/:slug
 * Requires: email, note
 * Returns: JSON
 */
noteRouter.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  if (!slug) {
    c.status(400);
    return c.json(returnJson(400, "Missing slug", null, null));
  }

  const body = await c.req.json();
  const email = body.email;
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

    if (!note) {
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

    return c.json(returnJson(200, "Successfully found note", note, null));
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
 * POST /cnotes/note/:slug/update
 * Requires: email, note
 * Returns: JSON
 */
noteRouter.post("/:slug/update", async (c) => {
  const notesdb = createNotesDb(c.env.CNOTES_DB_URL);
  const slug = c.req.param("slug");

  const body = await c.req.json();
  const result = noteSchema.safeParse(body);
  if (!result.success) {
    console.log(result.error);
    c.status(400);
    return c.json(returnJson(400, "Invalid input", null, result.error));
  }
  const sanitized = result.data;
  const email = sanitized.email;
  const note = sanitized.note;
  if (!email || !note) {
    c.status(400);
    return c.json(returnJson(400, "Missing email or note data", null, null));
  }

  const userId = await userExistsInNotesDB(notesdb, email);
  if (!userId || userId instanceof Error) {
    console.error(userId);
    c.status(401);
    return c.json(
      returnJson(401, "Unauthorized: Email does not exist.", null, null),
    );
  }

  let academicLevelId;
  let newSlug: string = note.slug;

  try {
    const userObject = await notesdb
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);
    if (userObject.length === 0) {
      c.status(404);
      return c.json(returnJson(404, "User not found", null, null));
    }
    const userId = userObject[0].id;

    const oldTitle = await notesdb
      .select({ title: notes.title })
      .from(notes)
      .where(eq(notes.slug, slug))
      .limit(1);

    if (oldTitle[0].title !== note.title) {
      newSlug = generateSlug(note.title);
    }

    const existingacademicLevel = await notesdb
      .select({ id: academicLevel.id })
      .from(academicLevel)
      .where(eq(academicLevel.academicLevel, note.academicLevel))
      .limit(1);
    if (existingacademicLevel.length > 0) {
      academicLevelId = existingacademicLevel[0].id;
    } else {
      const newAcademicLevel = await notesdb
        .insert(academicLevel)
        .values({ academicLevel: note.academicLevel })
        .returning({ id: academicLevel.id });
      academicLevelId = newAcademicLevel[0].id;
    }

    const updatedNote = await notesdb
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

    if (updatedNote.length === 0) {
      c.status(404);
      return c.json(
        returnJson(
          404,
          "Note not found or user not authorized to update.",
          null,
          null,
        ),
      );
    }

    return c.json(
      returnJson(200, "Note updated successfully", updatedNote[0], null),
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
 * DELETE /cnotes/note/:slug/delete
 * Requires: email
 * Returns: JSON
 */
noteRouter.delete("/:slug/delete", async (c) => {
  const notesdb = createNotesDb(c.env.CNOTES_DB_URL);
  const slug = c.req.param("slug");
  const body = await c.req.json();
  const email = body.email;
  if (!email) {
    c.status(400);
    return c.json(returnJson(400, "Missing required fields", null, null));
  }

  const userId = await userExistsInNotesDB(notesdb, email);
  if (!userId || userId instanceof Error) {
    console.error(userId);
    c.status(401);
    return c.json(
      returnJson(401, "Unauthorized: Email does not exist.", null, null),
    );
  }

  try {
    const userObject = await notesdb
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);
    if (userObject.length === 0) {
      c.status(404);
      return c.json(returnJson(404, "User not found.", null, null));
    }
    const userId = userObject[0].id;

    const deletedNote = await notesdb
      .delete(notes)
      .where(and(eq(notes.slug, slug), eq(notes.email, userId)))
      .returning({ id: notes.noteId });

    if (deletedNote.length === 0) {
      c.status(404);
      return c.json(
        returnJson(
          404,
          "Note not found or user not authorized to delete.",
          null,
          null,
        ),
      );
    }

    return c.json(
      returnJson(200, "Note deleted successfully", deletedNote, null),
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
