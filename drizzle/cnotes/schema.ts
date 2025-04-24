import { pgTable, serial, varchar, integer, foreignKey, unique, text, date, timestamp } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const user = pgTable("user", {
	id: serial().primaryKey().notNull(),
	email: varchar({ length: 255 }).notNull(),
});

export const grade = pgTable("grade", {
	id: serial().primaryKey().notNull(),
	grade: integer().notNull(),
});

export const subjects = pgTable("subjects", {
	id: serial().primaryKey().notNull(),
	subject: varchar({ length: 255 }).notNull(),
});

export const notes = pgTable("notes", {
	noteId: serial("note_id").primaryKey().notNull(),
	title: varchar({ length: 255 }).notNull(),
	slug: varchar({ length: 255 }).notNull(),
	notescontent: text().notNull(),
	board: varchar({ length: 255 }),
	dateCreated: date("date_created"),
	dateUpdated: timestamp("date_updated", { mode: 'string' }).defaultNow(),
	email: integer(),
	grade: integer(),
	subject: integer(),
}, (table) => [
	foreignKey({
			columns: [table.email],
			foreignColumns: [user.id],
			name: "email"
		}),
	foreignKey({
			columns: [table.grade],
			foreignColumns: [grade.id],
			name: "grade"
		}),
	foreignKey({
			columns: [table.subject],
			foreignColumns: [subjects.id],
			name: "subject"
		}),
	unique("notes_slug_key").on(table.slug),
]);
