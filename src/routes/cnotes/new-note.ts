import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { notesdb } from "../../db/cnotes";
import { noteSchema } from "../../zodSchema";
import { notes, academicLevel, user } from "../../../drizzle/cnotes/schema";
import { userExistsInNotesDb } from "../../utils/userExistsInNoteDb";
import { returnJson } from "../../utils/returnJson";
import { generateSlug } from "../../utils/generateSlug";

const newNoteRouter = new Hono();

newNoteRouter.post("/new-note/:type", async (c) => {
  const type = await c.req.param("type");
  if (!type) {
    c.status(400);
    return c.json(returnJson(400, "Missing slug", null, null));
  }

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
    return c.json(returnJson(400, "Missing required fields", null, null));
  }

  const [success, error] = await userExistsInNotesDb(email);
  if (error || !success) {
    return c.json(
      returnJson(401, "Unauthorized: Email does not exist.", null, null)
    );
  }

  if (
    !note.title ||
    !note.content ||
    !note.dateCreated ||
    !note.academicLevel ||
    !note.topic ||
    !note.type ||
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

  let userId;
  let academicLevelId;

  try {
    const existingUser = await notesdb
      .select({ id: user.id })
      .from(notes)
      .where(eq(user.email, email))
      .limit(1);
    if (existingUser.length > 0) {
      userId = existingUser[0].id;
    } else {
      const newUser = await notesdb
        .insert(user)
        .values({ email })
        .returning({ id: user.id });
      userId = newUser[0].id;
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

    const newNote = {
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
    };
    const newNoteQuery = await notesdb
      .insert(notes)
      .values(newNote)
      .returning({ insertedId: notes.noteId });

    return c.json(
      returnJson(200, "New note created successfully", newNoteQuery[0], null)
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

export default newNoteRouter;
