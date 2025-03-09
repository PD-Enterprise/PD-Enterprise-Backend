import { pgTable, unique, serial, varchar, text, timestamp } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const posts = pgTable("posts", {
	postId: serial("post_id").primaryKey().notNull(),
	title: varchar({ length: 255 }).notNull(),
	slug: varchar({ length: 255 }).notNull(),
	content: text().notNull(),
	authorId: varchar("author_id", { length: 255 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	unique("posts_slug_key").on(table.slug),
]);

export const apikeys = pgTable("apikeys", {
	id: serial().primaryKey().notNull(),
	keyName: varchar("key_name", { length: 255 }),
	apiKey: varchar("api_key", { length: 255 }).notNull(),
});

export const users = pgTable("users", {
	id: serial().primaryKey().notNull(),
	email: varchar({ length: 255 }).notNull(),
	membership: varchar({ length: 255 }),
});
