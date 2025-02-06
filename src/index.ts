import { Hono } from 'hono'
import { db } from './db'
import { posts } from './db/schema'
import { cors } from "hono/cors"

const app = new Hono()

app.get('/', (c) => {
    return c.text("This is the backend-service for PD Enterprise.")
})
app.notFound((c) => {
    return c.json({
        status: 404,
        message: "Not Found",
    })
})
app.onError((err, c) => {
    return c.json({
        status: 500,
        message: "Internal Server Error",
        error: err,
    })
})
app.use("/pd-enterprise/*", cors())
app.get("/pd-enterprise/blog/posts", async (c) => {
    try {
        const allPosts = await db.select().from(posts);
        return c.json({ status: 200, data: allPosts })
    } catch (error) {
        return c.json({ error })
    }
})

// HTTP Methods
app.get('/', (c) => c.text('GET /'))
app.post('/', (c) => c.text('POST /'))
app.put('/', (c) => c.text('PUT /'))
app.delete('/', (c) => c.text('DELETE /'))

export default app