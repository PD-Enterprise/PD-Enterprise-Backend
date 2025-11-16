import { Hono } from "hono";
import { cors } from "hono/cors";
import { validateRoute } from "./utils/validateRoute";
import dotenv from "dotenv";
import { returnJson } from "./utils/returnJson";
import { rateLimiter } from "./utils/ratelimiter";

import root from "./routes";
import usersRouter from "./routes/user-management";
import pdEnterpriseRouter from "./routes/pd-enterprise";
import aiRouter from "./routes/grade-ai";
import notesRouter from "./routes/cnotes";

const app = new Hono();
dotenv.config();

/*
  Error Handling
*/
app.notFound((c) => {
  c.status(404);
  return c.json(returnJson(404, "Endpoint not defined", null, null));
});
app.onError((err, c) => {
  console.error(err);
  c.status(500);
  return c.json(returnJson(500, "Internal Server Error", null, err));
});

/*
  CORS setup
*/
app.use(
  "*",
  cors({
    origin: (origin) => {
      if (origin && validateRoute(origin)) {
        return origin;
      }
      return null;
    },
  })
);

/*
  Rate Limits
*/
app.use("/", rateLimiter());
app.use("/pd-enterprise/blog/posts", rateLimiter());
app.use("/pd-enterprise/blog/posts/:slug", rateLimiter());
app.use("/notes/note/:slug", rateLimiter());
app.use("/ai/chat/:modal", rateLimiter(15));
app.use("*", rateLimiter(60));

/*
  Routes
*/
app.route("/", root);
app.route("/users", usersRouter);
app.route("/pd-enterprise", pdEnterpriseRouter);
app.route("/grade-ai", aiRouter);
app.route("/cnotes", notesRouter);

export default app;
