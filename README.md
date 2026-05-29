# PD Enterprise Backend

This is the backend service for PD Enterprise, built with TypeScript, the Hono web framework, and Drizzle ORM. It provides RESTful APIs for user management, blog posts, collaborative notes (CNotes), and AI-powered chat features (Grade AI).

**Stack:** Cloudflare Workers (serverless) · Hono v4 · Drizzle ORM · Neon PostgreSQL (x2) · Convex · Groq + Gemini

---

## Table of Contents

- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [API Overview](#api-overview)
  - [Blog Posts](#blog-posts)
  - [User Management](#user-management)
  - [CNotes (Collaborative Notes)](#cnotes-collaborative-notes)
  - [Grade AI (Chat)](#grade-ai-chat)
  - [Academic Levels](#academic-levels)
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
│   ├── index.ts               # Main entry: Hono app, CORS, rate limits, route mounting
│   ├── types.ts               # Cloudflare Workers env binding types (Bindings)
│   ├── allowedURLs.ts          # Allowed CORS origins
│   ├── zodSchema.ts            # Zod validation schemas
│   ├── routes/
│   │   ├── index.ts            # Root health-check routes (GET/POST /)
│   │   ├── user-management/    # User CRUD (get-role, new-user)
│   │   ├── pd-enterprise/      # Blog posts endpoints
│   │   ├── grade-ai/           # AI chat + academic level management
│   │   │   ├── index.ts        # Router: chat, model list, academic level
│   │   │   ├── routes/
│   │   │   │   ├── chat-handler.ts    # Main chat handler with SSE streaming
│   │   │   │   ├── prompts/            # Socratic & Direct mode prompts
│   │   │   │   └── providers/          # Groq & Gemini provider implementations
│   │   │   └── utils/                  # Model list, NDJSON stream helpers
│   │   └── cnotes/             # Collaborative notes CRUD
│   ├── utils/                  # Shared helpers (validation, rate limiting, slugs)
│   └── db/
│       ├── users/              # Drizzle client for Users DB (Neon)
│       └── cnotes/             # Drizzle client for CNotes DB (Neon)
├── convex/                     # Convex backend (AI chat storage, user profiles)
│   ├── schema.ts               # Tables: users, conversations, messages, academicLevel
│   ├── users.ts                # Mutations/queries: insertNewUser, get/updateAcademicLevel
│   └── utils/
├── drizzle/                    # Drizzle ORM schemas & migrations (introspected from DB)
│   ├── users/                  # Users DB: posts, users tables
│   └── cnotes/                 # CNotes DB: user, academic_level, notes tables
├── drizzle.config.users.ts     # Drizzle Kit config for Users DB
├── drizzle.config.cnotes.ts    # Drizzle Kit config for CNotes DB
├── wrangler.toml               # Cloudflare Workers deployment config
├── package.json
└── README.md
```

## API Overview

All endpoints return JSON with shape `{ status, message, data, error }`, unless noted otherwise.

### Blog Posts

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/pd-enterprise/blog/posts` | Fetch all blog posts |
| `GET` | `/pd-enterprise/blog/posts/:slug` | Fetch a single blog post by slug |

### User Management

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/users/roles/get-role` | Get or set a user's role (membership tier) by email |
| `POST` | `/users/new-user` | Register a new user across Users DB, CNotes DB, and Convex |

### CNotes (Collaborative Notes)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/cnotes/new-note/:type` | Create a new note with a specified type (e.g. `text`) |
| `POST` | `/cnotes/notes` | List all notes for a user (by email in body) |
| `POST` | `/cnotes/note/:slug` | Fetch a single note by slug (visibility/ownership checked) |
| `POST` | `/cnotes/note/:slug/update` | Update a note (ownership required) |
| `DELETE` | `/cnotes/note/:slug/delete` | Delete a note (ownership required) |

### Grade AI (Chat)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/grade-ai/chat` | Streamed AI chat (NDJSON). Supports Groq & Gemini providers, Socratic & Direct modes |
| `GET` | `/grade-ai/get-model-list` | List available AI models with provider and metadata |

**Chat Request Body:**

```json
{
  "prompt": "string (1-2000 chars)",
  "provider": "groq | gemini",
  "model": "string",
  "mode": "socratic | direct",
  "history": [{ "role": "user|assistant|system", "content": "string" }],
  "conversationId": "string",
  "email": "string"
}
```

**Chat Response:** `application/x-ndjson` stream with chunks:

- `{"type":"delta","delta":"..."}` — partial response text
- `{"type":"usage","usage":{"promptTokens":N,"completionTokens":N,"totalTokens":N}}` — token usage
- `{"type":"done"}` — stream complete
- `{"type":"error","message":"..."}` — stream error

### Academic Levels

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/grade-ai/get-user-academic-level` | Get a user's academic level (from Convex) |
| `POST` | `/grade-ai/update-user-academic-level` | Update a user's academic level (in Convex) |

## Database Schema

### Users Database (Neon PostgreSQL — `drizzle/users/schema.ts`)

- **`users`**: `id` (serial PK), `email` (unique), `name`, `membership`
- **`posts`**: `id` (serial PK), `slug` (unique), `title`, `excerpt`, `author`, `date`, `category`, `content`

### CNotes Database (Neon PostgreSQL — `drizzle/cnotes/schema.ts`)

- **`user`**: `id` (serial PK), `email`, `institution`
- **`academic_level`**: `id` (serial PK), `academic_level`
- **`notes`**: `note_id` (serial PK), `title`, `slug` (unique), `content`, `date_created`, `date_updated`, `email` (FK → user), `topic`, `type`, `visibility`, `academic_level` (FK → academic_level), `year`, `language`, `keywords`

### Convex (`convex/schema.ts`)

- **`users`**: email, name, avatarUrl, createdAt, academicLevel (→ academicLevel)
- **`conversations`**: userId (→ users), title, createdAt, updatedAt
- **`messages`**: conversationId (→ conversations), role (user|assistant|system), content, model, provider, createdAt
- **`academicLevel`**: academicLevelIndex, academicLevel

## Environment & Deployment

- Deployed as a **Cloudflare Workers** serverless application.
- Development config via `wrangler.toml` + `.dev.vars` (local env variables).
- Two Neon PostgreSQL databases (Users + CNotes) accessed via Drizzle ORM with `@neondatabase/serverless`.
- Convex backend for AI chat history, user profiles, and academic level data.
- AI inference via Groq SDK and Google Gemini API.

**Required environment variables** (set in `.dev.vars` for local, `wrangler secret` for production):

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Users DB connection string (Neon PostgreSQL) |
| `CNOTES_DB_URL` | CNotes DB connection string (Neon PostgreSQL) |
| `CONVEX_URL` | Convex deployment URL |
| `GROQ_API_KEY` | Groq API key for AI inference |
| `GEMINI_API_KEY` | Google Gemini API key for AI inference |

## Rate Limiting

| Scope | Limit |
|-------|-------|
| AI chat (`/grade-ai/chat/`) | 15 requests/minute |
| Blog & notes | 20 requests/minute |
| All other endpoints | 60 requests/minute |

## Dependencies

- **Hono** v4 — Web framework for Cloudflare Workers
- **Drizzle ORM** v0.44 — TypeScript ORM for PostgreSQL
- **Zod** v4 — Schema validation
- **Groq SDK** — AI chat (llama, GPT OSS models)
- **@google/genai** — Google Gemini AI (Flash 2.5)
- **Convex** — Realtime backend for chat storage & user profiles
- **hono-rate-limit** — Rate limiting middleware
- **nanoid** — Unique slug generation
- **Validator** — Email format validation

## Notes

- CORS origins are configured in `src/allowedURLs.ts`.
- Notes support `public` / `private` visibility with ownership checks.
- The AI chat endpoint uses NDJSON streaming (`Content-Type: application/x-ndjson`).
- The chat supports two teaching modes: **Socratic** (guided questions) and **Direct** (step-by-step explanations).
- Academic level data is stored in both Convex and CNotes DB — keep them in sync.
