import { Hono } from "hono";
import { cors } from "hono/cors";
import { validateRoute } from "./utils/validateRoute";
import dotenv from "dotenv";
import { returnJson } from "./utils/returnJson";
import { rateLimiter } from "./utils/ratelimiter";

const app = new Hono();
dotenv.config();

/*
  Error Handling
*/
app.notFound((c) => {
  c.status(404);
  const returnData = returnJson(404, "Endpoint not defined", null, null);
  return c.json(returnData);
});
app.onError((err, c) => {
  c.status(500);
  const returnData = returnJson(500, "Internal Server Error", null, err);
  return c.json(returnData);
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

export default app;
