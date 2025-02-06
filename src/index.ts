import { Hono } from 'hono'
import { db } from './db'
import { users } from './db/schema'

const app = new Hono()

app.get('/', (c) => {
    return c.json({
        status: 200,
        message: "This is the backend-service for PD Enterprise.",
    } as const)
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
app.get("/users", async (c) => {
    const userList = await main()
    return c.json(userList)
})

// HTTP Methods
app.get('/', (c) => c.text('GET /'))
app.post('/', (c) => c.text('POST /'))
app.put('/', (c) => c.text('PUT /'))
app.delete('/', (c) => c.text('DELETE /'))

export default app

async function main() {
    try {
        const allUsers = await db.select().from(users);
        console.log(allUsers)
        return allUsers
    } catch (error) {
        console.log(error)
        return error
    }
}
