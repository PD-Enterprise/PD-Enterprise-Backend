import { Hono } from "hono";

import newNoteRouter from "./new-note";
import notesRouter from "./notes";
import noteRouter from "./note";
import folderRouter from "./folders"
import { authUser } from "@/src/utils/middleware/authenticateUser";

const cnotesRouter = new Hono();

cnotesRouter.use("/new-note", authUser)
cnotesRouter.use("/notes", authUser)
cnotesRouter.use("/folder", authUser)

cnotesRouter.get("/", (c) => {
  c.status(200);
  return c.html("<!DOCTYPE html><html><body><h1>This is the backend-service for Cnotes.</h1></body></html>");
});
cnotesRouter.route("/new-note", newNoteRouter);
cnotesRouter.route("/notes", notesRouter);
cnotesRouter.route("/note", noteRouter);
cnotesRouter.route("/folder", folderRouter)

export default cnotesRouter;
