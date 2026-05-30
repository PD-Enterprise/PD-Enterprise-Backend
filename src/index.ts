import { Hono } from "hono";
import { cors } from "hono/cors";
import { validateRoute } from "./utils/validateRoute";
import { returnJson } from "./utils/returnJson";
import { rateLimiter } from "./utils/ratelimiter";

import root from "./routes";
import usersRouter from "./routes/user-management";
import pdEnterpriseRouter from "./routes/pd-enterprise";
import aiRouter from "./routes/grade-ai";
import notesRouter from "./routes/cnotes";
import { Bindings } from "./types";
import { createAuth } from "./lib/auth";

const app = new Hono<{ Bindings: Bindings }>();

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
    credentials: true,
  }),
);

/*
  Rate Limits
*/
app.use("/", rateLimiter());
app.use("/pd-enterprise/blog/posts", rateLimiter());
app.use("/pd-enterprise/blog/posts/:slug", rateLimiter());
app.use("/note/:slug", rateLimiter());
app.use("/grade-ai/chat/", rateLimiter(15));
app.use("*", rateLimiter(60));

/*
  Routes
*/
app.route("/", root);
app.route("/users", usersRouter);
app.route("/pd-enterprise", pdEnterpriseRouter);
app.route("/grade-ai", aiRouter);
app.route("/cnotes", notesRouter);
app.on(["GET", "POST"], "/api/auth/*", async (c) => {
  const auth = createAuth(c.env);
  const res = await auth.handler(c.req.raw)
  const origin = c.req.header("origin")
  if (origin && validateRoute(origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin)
    res.headers.set("Access-Control-Allow-Credentials", "true")
    res.headers.append("Vary", "Origin")
  }
  if (c.req.method === "POST" && c.req.path.includes("sign-in")) {
    console.log("[DEBUG] sign-in response Set-Cookie:", res.headers.get("set-cookie"))
    console.log("[DEBUG] sign-in response all headers:", [...res.headers.entries()])
  }
  if (c.req.method === "GET" && c.req.path.includes("callback")) {
    console.log("[DEBUG] callback Cookie header:", c.req.header("cookie"))
    console.log("[DEBUG] callback URL:", c.req.url)
  }
  return res
})

export default app;
