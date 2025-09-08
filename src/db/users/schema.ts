import { pgTable, unique, serial, varchar, text, date } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const posts = pgTable("posts", {
	id: serial().primaryKey().notNull(),
	slug: varchar({ length: 255 }).notNull(),
	title: varchar({ length: 255 }).notNull(),
	excerpt: text(),
	author: varchar({ length: 100 }),
	date: date(),
	category: varchar({ length: 100 }),
	content: text(),
}, (table) => [
	unique("posts_slug_key").on(table.slug),
]);

export const users = pgTable("users", {
	id: serial().primaryKey().notNull(),
	email: varchar({ length: 255 }).notNull(),
	membership: varchar({ length: 255 }),
	name: varchar({ length: 255 }).notNull(),
}, (table) => [
	unique("users_email_key").on(table.email),
]);
