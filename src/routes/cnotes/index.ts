import { Hono } from "hono";

import newNoteRouter from "./new-note";
import notesRouter from "./notes";
import noteRouter from "./note";

const cnotesRouter = new Hono();

cnotesRouter.get("/", (c) => {
  c.status(200);
  return c.html("<!DOCTYPE html><html><body><h1>This is the backend-service for Cnotes.</h1></body></html>");
});
cnotesRouter.route("/new-note", newNoteRouter);
cnotesRouter.route("/notes", notesRouter);
cnotesRouter.route("/note", noteRouter);

export default cnotesRouter;
