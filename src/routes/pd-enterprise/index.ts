import { Hono } from "hono";
import { createUsersDb } from "../../db/users";
import { posts } from "../../../drizzle/users/schema";
import { eq } from "drizzle-orm";
import { returnJson } from "../../utils/returnJson";
import { Bindings } from "../../types";

const pdEnterpriseRouter = new Hono<{ Bindings: Bindings }>();

pdEnterpriseRouter.get("/blog/posts", async (c) => {
  const db = createUsersDb(c.env.DATABASE_URL);
  try {
    const allPosts = await db.select().from(posts);
    c.status(200);
    return c.json(returnJson(200, "Posts found.", allPosts, null)); // Return a JSON response with the posts data
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
pdEnterpriseRouter.get("/blog/posts/:slug", async (c) => {
  const db = createUsersDb(c.env.DATABASE_URL);
  const slug = c.req.param("slug");

  try {
    const post = await db.select().from(posts).where(eq(posts.slug, slug));
    c.status(200);
    return c.json(returnJson(200, "Post found.", post, null));
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

export default pdEnterpriseRouter;
