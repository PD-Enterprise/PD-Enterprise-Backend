import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { notesdb } from "../../db/cnotes";
import { notes, academicLevel } from "../../../drizzle/cnotes/schema";
import { userExistsInNotesDb } from "../../utils/userExistsInNoteDb";

const notesRouter = new Hono();

notesRouter.post("/notes", async (c) => {
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

export default notesRouter;
