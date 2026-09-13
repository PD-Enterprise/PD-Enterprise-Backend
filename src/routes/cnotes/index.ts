import { Hono } from "hono";

import newNoteRouter from "./new-note";
import notesRouter from "./notes";
import noteRouter from "./note";
import folderRouter from "./folders"
import { handleImageUpload } from "./image-upload-handler";
import { authUser, authUserOptional } from "@/src/utils/middleware/authenticateUser";

const cnotesRouter = new Hono();

// Optional globally so GET /note/:slug can serve public notes anonymously.
// Write routes are strict: unauthenticated requests 401 here, before handlers.
cnotesRouter.use("/*", authUserOptional);
cnotesRouter.use("/new-note/*", authUser);
cnotesRouter.use("/notes/*", authUser);
cnotesRouter.use("/folder/*", authUser);
cnotesRouter.use("/upload-image", authUser);
cnotesRouter.use("/note/:slug/update", authUser);
cnotesRouter.use("/note/:slug/delete", authUser);

cnotesRouter.get("/", (c) => {
  c.status(200);
  return c.html("<!DOCTYPE html><html><body><h1>This is the backend-service for Cnotes.</h1></body></html>");
});
cnotesRouter.route("/new-note", newNoteRouter);
cnotesRouter.route("/notes", notesRouter);
cnotesRouter.route("/note", noteRouter);
cnotesRouter.route("/folder", folderRouter)
cnotesRouter.post("/upload-image", handleImageUpload);

export default cnotesRouter;
