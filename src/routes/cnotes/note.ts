import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { notesdb } from "../../db/cnotes";
import { notes, academicLevel, user } from "../../../drizzle/cnotes/schema";
import { userExistsInNotesDb } from "../../utils/userExistsInNoteDb";
import { returnJson } from "../../utils/returnJson";

const noteRouter = new Hono();

noteRouter.get("/note/:slug", async (c) => {
  const slug = await c.req.param("slug");
  if (!slug) {
    c.status(400);
    return c.json(returnJson(400, "Missing slug", null, null));
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
        academicLevel: academicLevel.academicLevel,
        year: notes.year,
        language: notes.language,
        keywords: notes.keywords,
      })
      .from(notes)
      .innerJoin(academicLevel, eq(notes.academicLevel, academicLevel.id))
      .where(eq(notes.slug, slug));

    if (!note || note.length === 0) {
      c.status(404);
      return c.json(returnJson(404, "Note not found.", null, null));
    }

    return c.json(returnJson(200, "Successfully found note", note[0], null));
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
noteRouter.post("/note/:slug/update", async (c) => {
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
noteRouter.delete("/note/:slug/delete", async (c) => {
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
