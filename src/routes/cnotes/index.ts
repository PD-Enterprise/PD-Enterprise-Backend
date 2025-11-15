import { Hono } from "hono";

import newNoteRouter from "./new-note";
import notesRouter from "./notes";
import noteRouter from "./note";

const cnotesRouter = new Hono();

cnotesRouter.route("/new-note", newNoteRouter);
cnotesRouter.route("/notes", notesRouter);
cnotesRouter.route("/note", noteRouter);

export default cnotesRouter;
