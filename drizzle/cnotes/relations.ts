import { relations } from "drizzle-orm/relations";
import { user, notes, grade, subjects, board } from "./schema";

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
	board: one(board, {
		fields: [notes.board],
		references: [board.id]
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

export const boardRelations = relations(board, ({many}) => ({
	notes: many(notes),
}));