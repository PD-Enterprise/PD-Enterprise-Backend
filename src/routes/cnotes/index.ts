import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { notesdb } from "../../db/cnotes";
import { noteSchema } from "../../zodSchema";
import { notes, academicLevel } from "../../../drizzle/cnotes/schema";
import { userExistsInNotesDb } from "../../utils/userExistsInNoteDb";

const notesRouter = new Hono();

notesRouter.post("/notes/new-note/:type", async (c) => {
  const type = await c.req.param("type");
  if (!type) {
    c.status(400);
    return c.json({
      status: 400,
      message: "Missing slug",
      data: null,
      error: null,
    });
  }
  const body = await c.req.json();
  // console.log(body)
  // Validate and sanitize input
  const result = noteSchema.safeParse(body);
  // console.log(result)
  if (!result.success) {
    c.status(400);
    return c.json({
      status: 400,
      message: "Invalid input",
      data: null,
      error: result.error,
    });
  }
  const sanitized = result.data;

  if (!sanitized.email || !sanitized.note) {
    c.status(400);
    return c.json({
      status: 400,
      message: "Missing required fields",
      data: null,
      error: null,
    });
  }
  const email = sanitized.email;
  // Auth check
  if (!(await userExistsInNotesDb(email))) {
    c.status(401);
    return c.json({
      status: 401,
      message: "Unauthorized: Email does not exist in notes database.",
      data: null,
      error: null,
    });
  }
  const note = sanitized.note;

  try {
    let userId;
    const existingUser = await notesdb
      .select({ id: noteUser.id })
      .from(noteUser)
      .where(eq(noteUser.email, email))
      .limit(1);

    if (existingUser.length > 0) {
      userId = existingUser[0].id;
    } else {
      const newUser = await notesdb
        .insert(noteUser)
        .values({ email })
        .returning({ id: noteUser.id });
      userId = newUser[0].id;
    }

    let subjectId;
    const existingSubject = await notesdb
      .select({ id: topic.id })
      .from(topic)
      .where(eq(topic.topic, note.topic))
      .limit(1);

    if (existingSubject.length > 0) {
      subjectId = existingSubject[0].id;
    } else {
      const newSubject = await notesdb
        .insert(topic)
        .values({ topic: note.topic })
        .returning({ id: topic.id });
      subjectId = newSubject[0].id;
    }

    let gradeId;
    const existingGrade = await notesdb
      .select({ id: academicLevel.id })
      .from(academicLevel)
      .where(eq(academicLevel.grade, Number(note.academicLevel)))
      .limit(1);
    if (existingGrade.length > 0) {
      gradeId = existingGrade[0].id;
    } else {
      const newGrade = await notesdb
        .insert(academicLevel)
        .values({ grade: Number(note.academicLevel) })
        .returning({ id: academicLevel.id });
      gradeId = newGrade[0].id;
    }

    const newNote = {
      title: note.title,
      slug: generateSlug(note.title),
      notescontent: note.content,
      dateCreated: note.dateCreated,
      dateUpdated: note.dateUpdated,
      email: userId,
      academicLevel: gradeId,
      topic: subjectId,
      type: type,
      visibility: note.visibility,
      language: note.language,
      year: note.year,
    };
    // console.log(newNote)
    const newNoteQuery = await notesdb
      .insert(notes)
      .values(newNote)
      .returning({ insertedId: notes.noteId });

    return c.json({
      status: 200,
      message: "New note created successfully",
      data: newNoteQuery[0],
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
notesRouter.post("/notes/notes", async (c) => {
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
  if (!(await userExistsInNotesDb(email))) {
    c.status(401);
    return c.json({
      status: 401,
      message: "Unauthorized: Email does not exist in notes database.",
      data: null,
      error: null,
    });
  }
  try {
    const getNotes = await notesdb
      .select({
        title: notes.title,
        slug: notes.slug,
        content: notes.content,
        dateCreated: notes.dateCreated,
        academicLevel: academicLevel.academicLevel,
        grade: academicLevel.grade,
        subject: notes.topic,
        type: notes.type,
      })
      .from(notes)
      .innerJoin(academicLevel, eq(notes.academicLevel, academicLevel.id))
      .innerJoin(noteUser, eq(notes.email, noteUser.id))
      .where(eq(noteUser.email, email));
    // console.log(getNotes);
    return c.json({
      status: 200,
      message: "Notes found successfully",
      data: getNotes,
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
notesRouter.get("/notes/note/:slug", async (c) => {
  const slug = await c.req.param("slug");
  if (!slug) {
    c.status(400);
    return c.json({
      status: 400,
      message: "Missing slug",
      data: null,
      error: null,
    });
  }
  try {
    const noteResult = await notesdb
      .select({
        noteId: notes.noteId,
        title: notes.title,
        slug: notes.slug,
        content: notes.content,
        dateCreated: notes.dateCreated,
        dateUpdated: notes.dateUpdated,
        academicLevel: academicLevel.academicLevel,
        grade: academicLevel.grade,
        topic: notes.topic,
        type: notes.type,
        language: notes.language,
        keywords: notes.keywords,
        year: notes.year,
        visibility: notes.visibility,
      })
      .from(notes)
      .innerJoin(academicLevel, eq(notes.academicLevel, academicLevel.id))
      .where(eq(notes.slug, slug));

    console.log(noteResult);

    if (!noteResult || noteResult.length === 0) {
      c.status(404);
      return c.json({
        status: 404,
        message: "Note not found",
        data: null,
        error: null,
      });
    }

    return c.json({
      status: 200,
      message: "Successfully found note",
      data: noteResult[0],
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
notesRouter.post("/notes/note/text/:slug/update", async (c) => {
  const slug = c.req.param("slug");
  const body = await c.req.json();
  const { email, data: noteData } = body;
  if (!email || !noteData) {
    c.status(400);
    return c.json({
      status: 400,
      message: "Missing email or note data",
      data: null,
      error: null,
    });
  }
  // Auth check
  if (!(await userExistsInNotesDb(email))) {
    c.status(401);
    return c.json({
      status: 401,
      message: "Unauthorized: Email does not exist in notes database.",
      data: null,
      error: null,
    });
  }
  try {
    if (
      !noteData.title ||
      !noteData.notescontent ||
      !noteData.dateUpdated ||
      !noteData.grade ||
      !noteData.subject
    ) {
      c.status(400);
      return c.json({
        status: 400,
        message: "Missing required fields in note data",
        data: null,
        error: null,
      });
    }

    const user = await notesdb
      .select({ id: noteUser.id })
      .from(noteUser)
      .where(eq(noteUser.email, email))
      .limit(1);
    if (user.length === 0) {
      c.status(404);
      return c.json({
        status: 404,
        message: "User not found",
        data: null,
        error: null,
      });
    }
    const userId = user[0].id;

    let subjectId;
    const existingSubject = await notesdb
      .select({ id: topic.id })
      .from(topic)
      .where(eq(topic.topic, noteData.subject))
      .limit(1);
    if (existingSubject.length > 0) {
      subjectId = existingSubject[0].id;
    } else {
      const newSubject = await notesdb
        .insert(topic)
        .values({ topic: noteData.subject })
        .returning({ id: topic.id });
      subjectId = newSubject[0].id;
    }

    let gradeId;
    const existingGrade = await notesdb
      .select({ id: academicLevel.id })
      .from(academicLevel)
      .where(eq(academicLevel.grade, Number(noteData.grade)))
      .limit(1);
    if (existingGrade.length > 0) {
      gradeId = existingGrade[0].id;
    } else {
      const newGrade = await notesdb
        .insert(academicLevel)
        .values({ grade: Number(noteData.grade) })
        .returning({ id: academicLevel.id });
      gradeId = newGrade[0].id;
    }

    const updatedNote = await notesdb
      .update(notes)
      .set({
        title: noteData.title,
        content: noteData.notescontent,
        dateUpdated: noteData.dateUpdated,
        academicLevel: gradeId,
        topic: subjectId,
      })
      .where(and(eq(notes.slug, slug), eq(notes.email, userId)))
      .returning();

    if (updatedNote.length === 0) {
      c.status(404);
      return c.json({
        status: 404,
        message: "Note not found or user not authorized to update.",
        data: null,
        error: null,
      });
    }

    return c.json({
      status: 200,
      message: "Note updated successfully",
      data: updatedNote[0],
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
notesRouter.delete("/notes/note/:slug/delete", async (c) => {
  const slug = c.req.param("slug");
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
  if (!(await userExistsInNotesDb(email))) {
    c.status(401);
    return c.json({
      status: 401,
      message: "Unauthorized: Email does not exist in notes database.",
      data: null,
      error: null,
    });
  }
  try {
    const user = await notesdb
      .select({ id: noteUser.id })
      .from(noteUser)
      .where(eq(noteUser.email, email))
      .limit(1);
    if (user.length === 0) {
      c.status(404);
      return c.json({
        status: 404,
        message: "User not found",
        data: null,
        error: null,
      });
    }
    const userId = user[0].id;

    const deletedNote = await notesdb
      .delete(notes)
      .where(and(eq(notes.slug, slug), eq(notes.email, userId)))
      .returning({ id: notes.noteId });

    if (deletedNote.length === 0) {
      c.status(404);
      return c.json({
        status: 404,
        message: "Note not found or user not authorized to delete.",
        data: null,
        error: null,
      });
    }

    return c.json({
      status: 200,
      message: "Note deleted successfully",
      data: deletedNote,
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

export default notesRouter;
