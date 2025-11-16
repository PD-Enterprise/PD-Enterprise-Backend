import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { notesdb } from "../../db/cnotes";
import { notes, academicLevel, user } from "../../../drizzle/cnotes/schema";
import { userExistsInNotesDb } from "../../utils/userExistsInNoteDb";
import { returnJson } from "../../utils/returnJson";

const notesRouter = new Hono();

notesRouter.post("/", async (c) => {
  const body = await c.req.json();
  const email = body.email;
  if (!email) {
    console.error("Email not provided");
    c.status(400);
    return c.json(returnJson(400, "Missing required fields", null, null));
  }

  const [success, error] = await userExistsInNotesDb(email);
  if (error || !success) {
    console.error(error);
    return c.json(
      returnJson(401, "Unauthorized: Email does not exist.", null, null)
    );
  }

  try {
    const notesList = await notesdb
      .select({
        title: notes.title,
        slug: notes.slug,
        content: notes.content,
        dateCreated: notes.dateCreated,
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

    return c.json(returnJson(200, "Notes found successfully", notesList, null));
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

export default notesRouter;
