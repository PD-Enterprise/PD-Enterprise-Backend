/* The above code is a TypeScript application that uses the Hono framework to build web applications.
It includes routes for handling various API requests related to PD Enterprise, user management, and
CNotes. Here is a summary of what the code is doing: */
import { Hono } from 'hono' // Import Hono framework for building web applications
import { cors } from "hono/cors" // Import CORS middleware for handling cross-origin requests
import { eq } from "drizzle-orm" // Import equality function for query building
import { validateRoute } from './utils/validateRoute' // Import function for validating route
import { checkUserExits } from './utils/checkUserExits'
import { db } from './db/users' // Import database connection
import { posts, users } from './db/users/schema' // Import posts and users schema from database
import { notesdb } from './db/cnotes'
import { notes } from "./db/cnotes/schema"
import Groq from 'groq-sdk'
import dotenv from 'dotenv'
dotenv.config() // Load environment variables from .env file

// VARIABLES
// Create a new Hono application instance
const app = new Hono()
let chatHistory: any = []
const initial_socratic_message = {
    "role": "user",
    "content": `You are a Socratic Teacher. And I am your student. And please try to keep your replies as brief as possible, while explaining each topic carefully. Please Explain the topic in relation to the NCERT CBSE 2024 curriculum. Please don't give the answer directly but rather a starting point to get started, your job is to help the student find the answer in his/her own way.
Also please return your answer in HTML format, with proper tags.`,
}
const initial_message = {
    "role": "user",
    "content": `Please return your answer in HTML format, with proper tags, only send inside the <body> tags, no need for the boilerplate or <body> tag.
        always return your whole answer strictly in the following json syntax: {summary: "[a short summary in a few words of the prompt"]", content: "[your response]"}`,
}
let chatCompletion: any

// FUNCTIONS
async function chatWithHistory(userMessage: string, modal: string, groq: any, modalParams: any) {
    chatHistory = [...chatHistory, { role: "user", content: userMessage }]
    if (modalParams.type == "custom") {
        chatCompletion = await groq.chat.completions.create({
            messages: [...chatHistory, initial_socratic_message],
            model: modal
        })
    } else if (modalParams.type == "direct") {
        chatCompletion = await groq.chat.completions.create({
            messages: [...chatHistory, initial_message],
            model: modal
        })
    }
    const response = chatCompletion.choices[0]?.message?.content
    chatHistory = [...chatHistory, { role: "assistant", content: response }]
    return response
}

// ROUTES
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
app.post("/users/roles/get-role", async (c) => {
    if (validateRoute(c.req.header("origin") || "")) {
        const body = await c.req.json()
        if (!body.email) {
            c.status(400)
            return c.json({ status: 400, message: "Missing required fields", data: null, error: null })
        }
        const email = body.email
        try {
            const role = await db.select({ role: users.membership }).from(users).where(eq(users.email, email))
            if (role[0].role == null || undefined
                || ""
            ) {
                const role = await db.update(users).set({ membership: "tier-1" }).where(eq(users.email, email))
                return c.json({ status: 200, message: "Role updated successfully", data: "tier-1", error: null })
            }
            else {
                return c.json({ status: 200, message: "Role found successfully", data: role[0].role, error: null })
            }
        } catch (error) {
            console.error(error)
            c.status(500)
            return c.json({ status: 500, message: "There was an error", data: null, error })
        }
    }
    else {
        c.status(500)
        return c.json({ status: 500, message: "Origin not allowed", data: null, error: null })
    }
})

// CNOTES API ROUTES
app.post("/notes/notes", async (c) => {
    if (validateRoute(c.req.header("origin") || "")) {
        const body = await c.req.json()
        if (!body.email) {
            c.status(400)
            return c.json({ status: 400, message: "Missing required fields", data: null, error: null })
        }
        const email = body.email
        try {
            const getNotes = await notesdb.select().from(notes).where(eq(notes.userEmail, email))
            return c.json({ status: 200, message: "Notes found successfully", data: getNotes, error: null })
        } catch (error) {
            console.error(error)
            c.status(500)
            return c.json({ status: 500, message: "There was an error", data: null, error })
        }
    } else {
        c.status(500)
        return c.json({ status: 500, message: "Origin not allowed", data: null, error: null })
    }
})
app.post("/notes/note/text/:slug", async (c) => {
    if (validateRoute(c.req.header("origin") || "")) {
        const body = await c.req.json()
        try {
            if (!body.slug) {
                c.status(400)
                return c.json({ status: 400, message: "Missing required fields", data: null, error: null })
            }
            const email = body.email
            const slug = body.slug
            const userExists = await checkUserExits(body.email)
            if (!userExists) {
                c.status(404)
                return c.json({ status: 404, message: "User doesn't exist", data: null, error: null })
            }

            const note = await notesdb.select().from(notes).where(eq(notes.slug, slug))
            return c.json({ status: 200, message: "Successfully found note", data: note, error: null })
        } catch (error) {
            console.error(error)
            c.status(500)
            return c.json({ status: 500, message: "There was an error", data: null, error })
        }
    } else {
        c.status(500)
        return c.json({ status: 500, message: "Origin not allowed", data: null, error: null })
    }
})

// GRADE AI ROUTES
app.post("/ai/chat/:modal", async (c) => {
    if (validateRoute(c.req.header("origin") || "")) {
        // @ts-expect-error
        const apiKey = c.env.GROQ_API_KEY
        const groq = new Groq({ apiKey })

        const modal = c.req.param("modal")
        const body = await c.req.json()
        const modalParams = body.modalParams
        if (!body.prompt || !body.modalParams) {
            c.status(400)
            return c.json({ status: 400, message: "Missing required fields", data: null, error: null })
        }
        const prompt = body.prompt
        try {
            const chatCompletion = await chatWithHistory(prompt, modal, groq, modalParams)
            return c.json({ status: 200, message: "Successfully found note", data: chatCompletion, error: null })
        } catch (error) {
            console.error(error)
            c.status(500)
            return c.json({ status: 500, message: "There was an error", data: null, error })
        }
    } else {
        c.status(500)
        return c.json({ status: 500, message: "Origin not allowed", data: null, error: null })
    }
})

// Export the application instance
export default app