import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { createNotesDb } from "../../db/cnotes";
import { notes, academicLevel, user } from "@/drizzle/cnotes/schema";
import { userExistsInNotesDB } from "@/src/routes/user-management/utils/userExists";
import { returnJson } from "@/utils/returnJson";
import { Bindings } from "../../types";

const notesRouter = new Hono<{ Bindings: Bindings }>();

notesRouter.post("/", async (c) => {
  const notesdb = createNotesDb(c.env.CNOTES_DB_URL);
  const body = await c.req.json();
  const email = body.email;
  if (!email) {
    console.error("Email not provided");
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
