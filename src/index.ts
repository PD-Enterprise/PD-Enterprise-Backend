/* The above code is a TypeScript application that uses the Hono framework to build web applications.
It includes routes for handling various API requests related to PD Enterprise, user management, and
CNotes. Here is a summary of what the code is doing: */
import { Hono } from "hono"; // Import Hono framework for building web applications
import { cors } from "hono/cors"; // Import CORS middleware for handling cross-origin requests
import { eq, and } from "drizzle-orm"; // Import equality function for query building
import { validateRoute } from "./utils/validateRoute"; // Import function for validating route
import { checkUserExits } from "./utils/checkUserExits";
import { db } from "./db/users"; // Import database connection
import { users, posts } from "./db/users/schema"; // Import posts and users schema from database
import { notesdb } from "./db/cnotes";
import { notes, user as noteUser } from "./db/cnotes/schema";
import Groq from "groq-sdk";
import dotenv from "dotenv";
import { grade, subjects } from "../drizzle/cnotes/schema";
import validator from "validator";
import rateLimit from "hono-rate-limit";
import { noteSchema } from "./zodSchema";
import { z } from "zod";
import { generateSlug } from "./generateSlug";

dotenv.config(); // Load environment variables from .env file

// VARIABLES
// Create a new Hono application instance
const app = new Hono();
let chatHistory: any = [];
const initial_socratic_message = {
    role: "user",
    content: `You are a Socratic Teacher. And I am your student. And please try to keep your replies as brief as possible, while explaining each topic carefully. Please Explain the topic in relation to the NCERT CBSE 2024 curriculum. Please don't give the answer directly but rather a starting point to get started, your job is to help the student find the answer in his/her own way.
Also please return your answer in HTML format, with proper tags.`,
};
const initial_message = {
    role: "user",
    content: `Please return your answer in HTML format, with proper tags, only send inside the <body> tags, no need for the boilerplate or <body> tag.
        always return your whole answer strictly in the following json syntax: {summary: "[a short summary in a few words of the prompt"]", content: "[your response]"}`,
};
let chatCompletion: any;

const chatSchema = z.object({
    prompt: z.string().min(1).max(2000).trim(),
    modalParams: z.any(), // Adjust as needed
});

// FUNCTIONS
async function chatWithHistory(
    userMessage: string,
    modal: string,
    groq: any,
    modalParams: any
) {
    chatHistory = [...chatHistory, { role: "user", content: userMessage }];
    if (modalParams.type == "custom") {
        chatCompletion = await groq.chat.completions.create({
            messages: [...chatHistory, initial_socratic_message],
            model: modal,
        });
    } else if (modalParams.type == "direct") {
        chatCompletion = await groq.chat.completions.create({
            messages: [...chatHistory, initial_message],
            model: modal,
        });
    }
    const response = chatCompletion.choices[0]?.message?.content;
    chatHistory = [...chatHistory, { role: "assistant", content: response }];
    return response;
}

// Helper function to check user existence in the main users db
async function userExistsInMainDb(email: string) {
    const user = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    return user.length > 0;
}
// Helper function to check user existence in the notes db
async function userExistsInNotesDb(email: string) {
    const existing = await notesdb
        .select({ id: noteUser.id })
        .from(noteUser)
        .where(eq(noteUser.email, email))
        .limit(1);
    return existing.length > 0;
}

// ROUTES
// Define a route for the root URL
app.get("/", (c) => {
    c.status(200);
    return c.text("This is the backend-service for PD Enterprise.");
});
// Define a route for handling not found errors
app.notFound((c) => {
    c.status(404); // Set the HTTP status code to 404 (Not Found)
    return c.json({
        status: 404, // Status code
        message: "Endpoint not defined", // Error message
        data: null,
        error: null,
    });
});
// Define a route for handling errors
app.onError((err, c) => {
    c.status(500); // Set the HTTP status code to 500 (Internal Server Error)
    return c.json({
        status: 500, // Status code
        message: "Internal Server Error", // Error message
        data: null,
        error: err, // The error object
    }); // Return a JSON response
});
// Apply CORS middleware to all routes
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

// Stricter rate limit for public GET endpoints
app.use(
    "/",
    rateLimit({
        windowMs: 60 * 1000, // 60,000 ms = 1 minute
        limit: 20, // 20 requests per minute (≈ 0.33 requests/sec)
        message: "Too many requests, please try again later.",
    })
);
app.use(
    "/pd-enterprise/blog/posts",
    rateLimit({
        windowMs: 60 * 1000, // 60,000 ms = 1 minute
        limit: 20, // 20 requests per minute (≈ 0.33 requests/sec)
        message: "Too many requests, please try again later.",
    })
);
app.use(
    "/pd-enterprise/blog/posts/:slug",
    rateLimit({
        windowMs: 60 * 1000, // 60,000 ms = 1 minute
        limit: 20, // 20 requests per minute (≈ 0.33 requests/sec)
        message: "Too many requests, please try again later.",
    })
);
app.use(
    "/notes/note/:slug",
    rateLimit({
        windowMs: 60 * 1000, // 60,000 ms = 1 minute
        limit: 20, // 20 requests per minute (≈ 0.33 requests/sec)
        message: "Too many requests, please try again later.",
    })
);
app.use(
    "/ai/chat/:modal",
    rateLimit({
        windowMs: 60 * 1000, // 60,000 ms = 1 minute
        limit: 15, // 15 requests per minute (≈ 0.25 requests/sec)
        message: "Too many AI requests, please try again later.",
    })
);

// Higher rate limit for all other routes
app.use(
    "*",
    rateLimit({
        windowMs: 60 * 1000, // 60,000 ms = 1 minute
        limit: 60, // 60 requests per minute (1 request/sec)
        message: "Too many requests, please try again later.",
    })
);

// PD ENTERPRISE API ROUTES
// Define a route for fetching all blog posts
app.get("/pd-enterprise/blog/posts", async (c) => {
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
app.get("/pd-enterprise/blog/posts/:slug", async (c) => {
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

// USER MANAGEMENT API ROUTES
app.post("/users/roles/get-role", async (c) => {
    const body = await c.req.json();
    if (!body.email) {
        c.status(400);
        return c.json({
            status: 400,
            message: "Missing required fields",
            data: null,
            error: null,
        });
    }
    const email = body.email;
    // Auth check
    if (!(await userExistsInMainDb(email))) {
        c.status(401);
        return c.json({
            status: 401,
            message: "Unauthorized: Email does not exist.",
            data: null,
            error: null,
        });
    }
    try {
        const role = await db
            .select({ role: users.membership })
            .from(users)
            .where(eq(users.email, email));
        if (role[0].role == null || undefined || "") {
            const role = await db
                .update(users)
                .set({ membership: "tier-1" })
                .where(eq(users.email, email));
            return c.json({
                status: 200,
                message: "Role updated successfully",
                data: "tier-1",
                error: null,
            });
        } else {
            return c.json({
                status: 200,
                message: "Role found successfully",
                data: role[0].role,
                error: null,
            });
        }
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
app.post("/user/new-user", async (c) => {
    const body = await c.req.json();
    if (!body.email) {
        c.status(400);
        return c.json({
            status: 400,
            message: "Missing required fields",
            data: null,
            error: null,
        });
    }
    const name = body.name;
    const email = body.email;

    // Validate email format
    if (!validator.isEmail(email)) {
        c.status(400);
        return c.json({
            status: 400,
            message: "Invalid email format",
            data: null,
            error: null,
        });
    }

    try {
        // Check if user exists in main users database
        const ifUserExists = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.email, email))
            .limit(1);
        if (ifUserExists.length > 0) {
            c.status(400);
            return c.json({
                status: 400,
                message: "User already exists",
                data: null,
                error: null,
            });
        }

        // Insert user into main users database
        const user = await db
            .insert(users)
            .values({ name, email, membership: "tier-1" })
            .returning({ id: users.id });

        // Check if user exists in notes database
        const existingNoteUser = await notesdb
            .select({ id: noteUser.id })
            .from(noteUser)
            .where(eq(noteUser.email, email))
            .limit(1);

        if (existingNoteUser.length > 0) {
            c.status(400);
            return c.json({
                status: 400,
                message: "User already exists in notes",
                data: null,
                error: null,
            });
        }
        await notesdb.insert(noteUser).values({ email });

        return c.json({
            status: 200,
            message: "User created successfully",
            data: user[0],
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

// CNOTES API ROUTES
app.post("/notes/new-note/:type", async (c) => {
    const type = await c.req.param("type");
    if (!type) {
        c.status(400);
        return c.json({
            status: 400,
            message: "Missing slug",
            data: null,
            error: null,
        });
    }
    const body = await c.req.json();
    // console.log(body)
    // Validate and sanitize input
    const result = noteSchema.safeParse(body);
    // console.log(result)
    if (!result.success) {
        c.status(400);
        return c.json({
            status: 400,
            message: "Invalid input",
            data: null,
            error: result.error,
        });
    }
    const sanitized = result.data;

    if (!sanitized.email || !sanitized.note) {
        c.status(400);
        return c.json({
            status: 400,
            message: "Missing required fields",
            data: null,
            error: null,
        });
    }
    const email = sanitized.email;
    // Auth check
    if (!(await userExistsInNotesDb(email))) {
        c.status(401);
        return c.json({
            status: 401,
            message: "Unauthorized: Email does not exist in notes database.",
            data: null,
            error: null,
        });
    }
    const note = sanitized.note;

    try {
        let userId;
        const existingUser = await notesdb
            .select({ id: noteUser.id })
            .from(noteUser)
            .where(eq(noteUser.email, email))
            .limit(1);

        if (existingUser.length > 0) {
            userId = existingUser[0].id;
        } else {
            const newUser = await notesdb
                .insert(noteUser)
                .values({ email })
                .returning({ id: noteUser.id });
            userId = newUser[0].id;
        }

        let subjectId;
        const existingSubject = await notesdb
            .select({ id: subjects.id })
            .from(subjects)
            .where(eq(subjects.subject, note.subject))
            .limit(1);

        if (existingSubject.length > 0) {
            subjectId = existingSubject[0].id;
        } else {
            const newSubject = await notesdb
                .insert(subjects)
                .values({ subject: note.subject })
                .returning({ id: subjects.id });
            subjectId = newSubject[0].id;
        }

        let gradeId;
        const existingGrade = await notesdb
            .select({ id: grade.id })
            .from(grade)
            .where(eq(grade.grade, Number(note.grade)))
            .limit(1);
        if (existingGrade.length > 0) {
            gradeId = existingGrade[0].id;
        } else {
            const newGrade = await notesdb
                .insert(grade)
                .values({ grade: Number(note.grade) })
                .returning({ id: grade.id });
            gradeId = newGrade[0].id;
        }

        const newNote = {
            title: note.title,
            slug: generateSlug(note.title),
            notescontent: note.notescontent,
            dateCreated: note.dateCreated,
            dateUpdated: note.dateUpdated,
            email: userId,
            grade: gradeId,
            subject: subjectId,
            type: type
        };
        // console.log(newNote)
        const newNoteQuery = await notesdb
            .insert(notes)
            .values(newNote)
            .returning({ insertedId: notes.noteId });

        return c.json({
            status: 200,
            message: "New note created successfully",
            data: newNoteQuery[0],
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
app.post("/notes/notes", async (c) => {
    const body = await c.req.json();
    if (!body.email) {
        c.status(400);
        return c.json({
            status: 400,
            message: "Missing required fields",
            data: null,
            error: null,
        });
    }
    const email = body.email;
    // Auth check
    if (!(await userExistsInNotesDb(email))) {
        c.status(401);
        return c.json({
            status: 401,
            message: "Unauthorized: Email does not exist in notes database.",
            data: null,
            error: null,
        });
    }
    try {
        const getNotes = await notesdb
            .select({
                title: notes.title,
                slug: notes.slug,
                notescontent: notes.notescontent,
                dateCreated: notes.dateCreated,
                grade: grade.grade,
                subject: subjects.subject,
                type: notes.type
            })
            .from(notes)
            .innerJoin(subjects, eq(notes.subject, subjects.id))
            .innerJoin(grade, eq(notes.grade, grade.id))
            .innerJoin(noteUser, eq(notes.email, noteUser.id))
            .where(eq(noteUser.email, email));
        // console.log(getNotes)
        return c.json({
            status: 200,
            message: "Notes found successfully",
            data: getNotes,
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
app.get("/notes/note/:slug", async (c) => {
    const slug = await c.req.param("slug");
    if (!slug) {
        c.status(400);
        return c.json({
            status: 400,
            message: "Missing slug",
            data: null,
            error: null,
        });
    }
    try {
        const noteResult = await notesdb
            .select({
                noteId: notes.noteId,
                title: notes.title,
                slug: notes.slug,
                notescontent: notes.notescontent,
                dateCreated: notes.dateCreated,
                dateUpdated: notes.dateUpdated,
                grade: grade.grade,
                subject: subjects.subject,
                type: notes.type
            })
            .from(notes)
            .innerJoin(subjects, eq(notes.subject, subjects.id))
            .innerJoin(grade, eq(notes.grade, grade.id))
            .where(eq(notes.slug, slug));

        if (!noteResult || noteResult.length === 0) {
            c.status(404);
            return c.json({
                status: 404,
                message: "Note not found",
                data: null,
                error: null,
            });
        }

        return c.json({
            status: 200,
            message: "Successfully found note",
            data: noteResult[0],
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
app.post("/notes/note/text/:slug/update", async (c) => {
    const slug = c.req.param("slug");
    const body = await c.req.json();
    const { email, data: noteData } = body;
    if (!email || !noteData) {
        c.status(400);
        return c.json({
            status: 400,
            message: "Missing email or note data",
            data: null,
            error: null,
        });
    }
    // Auth check
    if (!(await userExistsInNotesDb(email))) {
        c.status(401);
        return c.json({
            status: 401,
            message: "Unauthorized: Email does not exist in notes database.",
            data: null,
            error: null,
        });
    }
    try {
        if (
            !noteData.title ||
            !noteData.notescontent ||
            !noteData.dateUpdated ||
            !noteData.grade ||
            !noteData.subject
        ) {
            c.status(400);
            return c.json({
                status: 400,
                message: "Missing required fields in note data",
                data: null,
                error: null,
            });
        }

        const user = await notesdb
            .select({ id: noteUser.id })
            .from(noteUser)
            .where(eq(noteUser.email, email))
            .limit(1);
        if (user.length === 0) {
            c.status(404);
            return c.json({
                status: 404,
                message: "User not found",
                data: null,
                error: null,
            });
        }
        const userId = user[0].id;

        let subjectId;
        const existingSubject = await notesdb
            .select({ id: subjects.id })
            .from(subjects)
            .where(eq(subjects.subject, noteData.subject))
            .limit(1);
        if (existingSubject.length > 0) {
            subjectId = existingSubject[0].id;
        } else {
            const newSubject = await notesdb
                .insert(subjects)
                .values({ subject: noteData.subject })
                .returning({ id: subjects.id });
            subjectId = newSubject[0].id;
        }

        let gradeId;
        const existingGrade = await notesdb
            .select({ id: grade.id })
            .from(grade)
            .where(eq(grade.grade, Number(noteData.grade)))
            .limit(1);
        if (existingGrade.length > 0) {
            gradeId = existingGrade[0].id;
        } else {
            const newGrade = await notesdb
                .insert(grade)
                .values({ grade: Number(noteData.grade) })
                .returning({ id: grade.id });
            gradeId = newGrade[0].id;
        }

        const updatedNote = await notesdb
            .update(notes)
            .set({
                title: noteData.title,
                notescontent: noteData.notescontent,
                dateUpdated: noteData.dateUpdated,
                grade: gradeId,
                subject: subjectId,
            })
            .where(and(eq(notes.slug, slug), eq(notes.email, userId)))
            .returning();

        if (updatedNote.length === 0) {
            c.status(404);
            return c.json({
                status: 404,
                message: "Note not found or user not authorized to update.",
                data: null,
                error: null,
            });
        }

        return c.json({
            status: 200,
            message: "Note updated successfully",
            data: updatedNote[0],
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
app.delete("/notes/note/:slug/delete", async (c) => {
    const slug = c.req.param("slug");
    const body = await c.req.json();
    if (!body.email) {
        c.status(400);
        return c.json({
            status: 400,
            message: "Missing required fields",
            data: null,
            error: null,
        });
    }
    const email = body.email;
    // Auth check
    if (!(await userExistsInNotesDb(email))) {
        c.status(401);
        return c.json({
            status: 401,
            message: "Unauthorized: Email does not exist in notes database.",
            data: null,
            error: null,
        });
    }
    try {
        const user = await notesdb
            .select({ id: noteUser.id })
            .from(noteUser)
            .where(eq(noteUser.email, email))
            .limit(1);
        if (user.length === 0) {
            c.status(404);
            return c.json({
                status: 404,
                message: "User not found",
                data: null,
                error: null,
            });
        }
        const userId = user[0].id;

        const deletedNote = await notesdb
            .delete(notes)
            .where(and(eq(notes.slug, slug), eq(notes.email, userId)))
            .returning({ id: notes.noteId });

        if (deletedNote.length === 0) {
            c.status(404);
            return c.json({
                status: 404,
                message: "Note not found or user not authorized to delete.",
                data: null,
                error: null,
            });
        }

        return c.json({
            status: 200,
            message: "Note deleted successfully",
            data: deletedNote,
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

// GRADE AI ROUTES
app.post("/ai/chat/:modal", async (c) => {
    // @ts-expect-error
    const apiKey = c.env.GROQ_API_KEY;
    const groq = new Groq({ apiKey });

    const modal = c.req.param("modal");
    const body = await c.req.json();
    const modalParams = body.modalParams;
    if (!body.prompt || !body.modalParams) {
        c.status(400);
        return c.json({
            status: 400,
            message: "Missing required fields",
            data: null,
            error: null,
        });
    }
    const prompt = body.prompt;
    try {
        const chatCompletion = await chatWithHistory(
            prompt,
            modal,
            groq,
            modalParams
        );
        return c.json({
            status: 200,
            message: "Successfully found note",
            data: chatCompletion,
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

// Export the application instance
export default app;

