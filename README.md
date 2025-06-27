# PD Enterprise Backend

This is the backend service for PD Enterprise, built with TypeScript, the Hono web framework, and Drizzle ORM. It provides RESTful APIs for user management, blog posts, collaborative notes (CNotes), and AI-powered chat features.

## Table of Contents

- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [API Overview](#api-overview)
  - [Blog Posts](#blog-posts)
  - [User Management](#user-management)
  - [CNotes (Collaborative Notes)](#cnotes-collaborative-notes)
  - [AI Chat](#ai-chat)
- [Database Schema](#database-schema)
- [Environment & Deployment](#environment--deployment)
- [Dependencies](#dependencies)
- [Notes](#notes)

---

## Getting Started

Install dependencies and start the development server:

```sh
npm install
npm run dev
```

To deploy:

```sh
npm run deploy
```

## Project Structure

```
.
├── src/
│   ├── index.ts           # Main application entry point (API routes)
│   ├── allowedURLs.ts     # Allowed CORS origins
│   ├── zodSchema.ts       # Zod validation schemas
│   ├── utils/             # Utility functions (route validation, cookies, user checks)
│   └── db/
│       ├── users/         # User and blog post database schema & logic
│       └── cnotes/        # CNotes (notes) database schema & logic
├── drizzle/               # Drizzle ORM config and migrations
├── drizzle.config.*.ts    # Drizzle ORM config files
├── wrangler.json          # Cloudflare Workers deployment config
├── package.json           # Project metadata and scripts
└── README.md              # This file
```

## API Overview

### Blog Posts

- `GET /pd-enterprise/blog/posts`  
  Fetch all blog posts.
- `GET /pd-enterprise/blog/posts/:slug`  
  Fetch a single blog post by slug.

### User Management

- `POST /users/roles/get-role`  
  Get or set a user's role by email.
- `POST /user/new-user`  
  Register a new user (adds to both main and notes databases).

### CNotes (Collaborative Notes)

- `POST /notes/new-note/text`  
  Create a new note (requires user authentication in notes DB).
- `POST /notes/notes`  
  Fetch all notes for a user.
- `GET /notes/note/:slug`  
  Fetch a single note by slug.
- `POST /notes/note/text/:slug/update`  
  Update a note (requires user authentication).
- `DELETE /notes/note/:slug/delete`  
  Delete a note (requires user authentication).

### AI Chat

- `POST /ai/chat/:modal`  
  Interact with an AI assistant (uses Groq API, supports different chat modes).

## Database Schema

### Users Database (`src/db/users/schema.ts`)

- **users**:  
  `id`, `email`, `membership`
- **posts**:  
  `postId`, `title`, `slug`, `content`, `authorId`, `createdAt`
- **apikeys**:  
  `id`, `keyName`, `apiKey`

### CNotes Database (`src/db/cnotes/schema.ts`)

- **noteUser**:  
  `id`, `email`
- **grade**:  
  `id`, `grade`
- **subjects**:  
  `id`, `subject`
- **notes**:  
  `noteId`, `title`, `slug`, `notescontent`, `board`, `dateCreated`, `dateUpdated`, `email` (FK), `grade` (FK), `subject` (FK)

## Environment & Deployment

- Uses Cloudflare Workers for serverless deployment.
- Configuration is managed via `wrangler.json`.
- Environment variables (DB URLs, API keys) are set in `wrangler.json` and `.env`.

## Dependencies

- **Hono**: Web framework for Cloudflare Workers.
- **Drizzle ORM**: TypeScript ORM for PostgreSQL.
- **Zod**: Schema validation.
- **Groq SDK**: AI chat integration.
- **Validator**: Input validation.
- **dotenv**: Environment variable management.
- **hono-rate-limit**: Rate limiting middleware.

## Notes

- All endpoints return JSON responses with a consistent structure: `{ status, message, data, error }`.
- CORS is enforced and configurable via `allowedURLs.ts`.
- Rate limiting is applied to all endpoints.
- The AI chat endpoint supports different modes, including a Socratic teaching mode.
