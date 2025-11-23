import { Hono } from "hono";
import { eq, and, is } from "drizzle-orm";
import { notesdb } from "../../db/cnotes";
import { notes, academicLevel, user } from "../../../drizzle/cnotes/schema";
import { userExistsInNotesDb } from "../../utils/userExistsInNoteDb";
import { returnJson } from "../../utils/returnJson";
import { noteSchema } from "../../zodSchema";
import { generateSlug } from "../../utils/generateSlug";

const noteRouter = new Hono();

noteRouter.post("/:slug", async (c) => {
  const slug = await c.req.param("slug");
  if (!slug) {
    c.status(400);
    return c.json(returnJson(400, "Missing slug", null, null));
  }

  const body = await c.req.json();
  let isAuthenticated: boolean;
  const email = body.email;
  if (email == "null") {
    isAuthenticated = false;
  } else {
    isAuthenticated = true;
  }

  try {
    const noteObject = await notesdb
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
      .where(eq(notes.slug, slug));

    if (!noteObject || noteObject.length === 0) {
      c.status(404);
      return c.json(returnJson(404, "Note not found.", null, null));
    }

    const note = noteObject[0];
    let isOwner: boolean = false;

    if (isAuthenticated) {
      const userObject = await notesdb
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, email))
        .limit(1);

      if (userObject.length === 0) {
      }
      const userId = userObject[0].id;
      isOwner = note.email === userId;
    }

    if (note.visibility === "public") {
      return c.json(returnJson(200, "Successfully found note", note, null));
    } else if (note.visibility === "private") {
      if (!isAuthenticated) {
        c.status(401);
        return c.json(
          returnJson(401, "Unauthorized: Not authenticated.", null, null)
        );
      }
      if (!isOwner) {
        c.status(403);
        return c.json(
          returnJson(
            403,
            "You do not have permission to view this private note.",
            null,
            null
          )
        );
      }

      return c.json(returnJson(200, "Successfully found note", note, null));
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

noteRouter.post("/:slug/update", async (c) => {
  const slug = c.req.param("slug");

  const body = await c.req.json();
  const result = noteSchema.safeParse(body);
  if (!result.success) {
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

  const [success, error] = await userExistsInNotesDb(email);
  if (error || !success) {
    return c.json(
      returnJson(401, "Unauthorized: Email does not exist.", null, null)
    );
  }

  if (
    !note.title ||
    !note.slug ||
    !note.content ||
    !note.dateCreated ||
    !note.academicLevel ||
    !note.topic ||
    !note.visibility ||
    !note.year ||
    !note.language ||
    !note.keywords
  ) {
    c.status(400);
    return c.json(
      returnJson(400, "Missing required fields in note data", null, null)
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
          null
        )
      );
    }

    return c.json(
      returnJson(200, "Note updated successfully", updatedNote[0], null)
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
});

noteRouter.delete("/:slug/delete", async (c) => {
  const slug = c.req.param("slug");
  const body = await c.req.json();
  const email = body.email;
  if (!email) {
    c.status(400);
    return c.json(returnJson(400, "Missing required fields", null, null));
  }

  const [success, error] = await userExistsInNotesDb(email);
  if (error || !success) {
    return c.json(
      returnJson(401, "Unauthorized: Email does not exist.", null, null)
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
          null
        )
      );
    }

    return c.json(
      returnJson(200, "Note deleted successfully", deletedNote, null)
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
});

export default noteRouter;
