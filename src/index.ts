import { Hono } from 'hono' // Import Hono framework for building web applications
import { db } from './db' // Import database connection
import { posts } from './db/schema' // Import posts and users schema from database
import { cors } from "hono/cors" // Import CORS middleware for handling cross-origin requests
import { eq } from "drizzle-orm" // Import equality function for query building
import { allowedUrls } from './allowedURLs' // Import list of allowed URLs for CORS
import { validateRoute } from './utils/validateRoute' // Import function for validating route
import { checkUserExits } from './utils/checkUserExits'
import { newCookie } from './utils/newCookie'
import stringHash from 'string-hash'
import { users } from '../drizzle/schema'
import { newUser } from './types'

// Create a new Hono application instance
const app = new Hono()

// Define a route for the root URL
app.get('/', (c) => {
    c.status(200)
    return c.text("This is the backend-service for PD Enterprise.")
})
// Define a route for handling not found errors
app.notFound((c) => {
    c.status(404) // Set the HTTP status code to 404 (Not Found)
    return c.json({
        status: 404, // Status code
        message: "Not Found", // Error message
        data: null,
        error: null,
    })
})
// Define a route for handling errors
app.onError((err, c) => {
    c.status(500) // Set the HTTP status code to 500 (Internal Server Error)
    return c.json({
        status: 500, // Status code
        message: "Internal Server Error", // Error message
        data: null,
        error: err, // The error object
    }) // Return a JSON response
})
// Apply CORS middleware to all routes
app.use("*", cors())

// PD ENTERPRISE API ROUTES
// Define a route for fetching all blog posts
app.get("/pd-enterprise/blog/posts", async (c) => {
    if (validateRoute(c.req.header("origin") || '')) {
        try {
            const allPosts = await db.select().from(posts); // Fetch all posts from the database
            c.status(200); // Set the HTTP status code to 200 (OK)
            return c.json({ status: 200, message: "Posts Data found.", data: allPosts, error: null }) // Return a JSON response with the posts data
        } catch (error) {
            c.status(500); // Set the HTTP status code to 500 (Internal Server Error)
            return c.json({ status: 500, message: "There was an error", data: null, error }) // Return a JSON response with the error
        }
    } else {
        c.status(500)
        return c.json({ status: 500, message: "Origin not allowed", data: null, error: null })
    }
})
// Define a route for fetching a single blog post by slug
app.get("/pd-enterprise/blog/posts/:slug", async (c) => {
    if (validateRoute(c.req.header("origin") || "")) {
        const slug = c.req.param("slug");
        try {
            const post = await db.select().from(posts).where(eq(posts.slug, slug))
            c.status(200);
            return c.json({ status: 200, message: "Post data found.", data: post, error: null })
        } catch (error) {
            c.status(500);
            return c.json({ status: 500, message: "There was error", data: null, error })
        }
    } else {
        c.status(500)
        return c.json({ status: 500, message: "Origin not allowed", data: null, error: null })
    }
})

// USER MANAGEMENT API ROUTES
app.post("/users/register", async (c) => {
    if (validateRoute(c.req.header("origin") || "")) {
        const body = await c.req.json()
        try {
            const userExists = await checkUserExits(body.email)
            if (userExists) {
                c.status(403)
                return c.json({ status: 403, message: "User already exists", data: null, error: null })
            }
            const headers = await newCookie("session_id")
            const cookieId = headers["Set-cookie"].split("=")[1].split(";")[0]

            const query = await db.insert(users).values({
                email: body.email,
                userpassword: stringHash(body.password),
                username: body.username,
                sessionId: cookieId,
                membership: "tier-1",
                provider: "email"
            })
            if (query) {
                c.status(201)
                return c.json({ status: 201, message: "User created successfully.", data: null, error: null })
            }
            c.status(500)
            return c.json({ status: 500, message: "User creation failed", data: null, error: null })
        } catch (error) {
            c.status(500)
            return c.json({ status: 500, message: "There was an error", data: null, error })
        }
    } else {
        c.status(500)
        return c.json({ status: 500, message: "Origin not allowed", data: null, error: null })
    }
})


// CNOTES API ROUTES


// Export the application instance
export default app