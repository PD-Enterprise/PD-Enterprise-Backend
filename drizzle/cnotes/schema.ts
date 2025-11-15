import { pgTable, serial, varchar, text, foreignKey, unique, date, timestamp, integer } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const user = pgTable("user", {
	id: serial().primaryKey().notNull(),
	email: varchar({ length: 255 }).notNull(),
	institution: text(),
});

export const academicLevel = pgTable("academic_level", {
	id: serial().primaryKey().notNull(),
	academicLevel: varchar("academic_level", { length: 255 }),
});

export const notes = pgTable("notes", {
	noteId: serial("note_id").primaryKey().notNull(),
	title: varchar({ length: 255 }).notNull(),
	slug: varchar({ length: 255 }).notNull(),
	content: text().notNull(),
	dateCreated: date("date_created").notNull(),
	dateUpdated: timestamp("date_updated", { mode: 'string' }).defaultNow().notNull(),
	email: integer().notNull(),
	topic: varchar({ length: 255 }).notNull(),
	type: text().notNull(),
	visibility: varchar({ length: 255 }).notNull(),
	academicLevel: integer("academic_level").notNull(),
	year: integer().notNull(),
	language: varchar({ length: 255 }).notNull(),
	keywords: text(),
}, (table) => [
	foreignKey({
			columns: [table.email],
			foreignColumns: [user.id],
			name: "email"
		}),
	foreignKey({
			columns: [table.academicLevel],
			foreignColumns: [academicLevel.id],
			name: "academic_level"
		}),
	unique("notes_slug_key").on(table.slug),
]);
