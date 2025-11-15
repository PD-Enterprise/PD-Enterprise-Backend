import { Hono } from "hono";
import { db } from "../../db/users";
import { posts } from "../../../drizzle/users/schema";
import { eq } from "drizzle-orm";

const pdEnterpriseRouter = new Hono();

// Define a route for fetching all blog posts
pdEnterpriseRouter.get("/blog/posts", async (c) => {
  try {
    const allPosts = await db.select().from(posts); // Fetch all posts from the database
    c.status(200); // Set the HTTP status code to 200 (OK)
    return c.json({
      status: 200,
      message: "Posts Data found.",
      data: allPosts,
      error: null,
    }); // Return a JSON response with the posts data
  } catch (error) {
    console.error(error);
    c.status(500);
    return c.json({
      status: 500,
      message: "An unexpected error occurred. Please try again later.",
      data: null,
      error: null,
    });
  }
});
// Define a route for fetching a single blog post by slug
pdEnterpriseRouter.get("/blog/posts/:slug", async (c) => {
  const slug = c.req.param("slug");
  try {
    const post = await db.select().from(posts).where(eq(posts.slug, slug));
    c.status(200);
    return c.json({
      status: 200,
      message: "Post data found.",
      data: post,
      error: null,
    });
  } catch (error) {
    console.error(error);
    c.status(500);
    return c.json({
      status: 500,
      message: "An unexpected error occurred. Please try again later.",
      data: null,
      error: null,
    });
  }
});

export default pdEnterpriseRouter;
