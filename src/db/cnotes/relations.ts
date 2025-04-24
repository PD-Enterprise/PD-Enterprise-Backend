import { relations } from "drizzle-orm/relations";
import { user, notes, grade, subjects } from "./schema";

export const notesRelations = relations(notes, ({one}) => ({
	user: one(user, {
		fields: [notes.email],
		references: [user.id]
	}),
	grade: one(grade, {
		fields: [notes.grade],
		references: [grade.id]
	}),
	subject: one(subjects, {
		fields: [notes.subject],
		references: [subjects.id]
	}),
}));

export const userRelations = relations(user, ({many}) => ({
	notes: many(notes),
}));

export const gradeRelations = relations(grade, ({many}) => ({
	notes: many(notes),
}));

export const subjectsRelations = relations(subjects, ({many}) => ({
	notes: many(notes),
}));