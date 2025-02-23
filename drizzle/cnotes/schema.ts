import { pgTable, unique, serial, varchar, text, integer, date, timestamp } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const notes = pgTable("notes", {
	noteId: serial("note_id").primaryKey().notNull(),
	title: varchar({ length: 255 }).notNull(),
	slug: varchar({ length: 255 }).notNull(),
	noteContent: text("note_content").notNull(),
	subject: varchar({ length: 255 }).notNull(),
	grade: integer().notNull(),
	userEmail: varchar("user_email", { length: 255 }).notNull(),
	board: varchar({ length: 255 }),
	school: varchar({ length: 255 }),
	dateCreated: date("date_created"),
	dateUpdated: timestamp("date_updated", { mode: 'string' }).defaultNow(),
}, (table) => [
	unique("notes_slug_key").on(table.slug),
]);
