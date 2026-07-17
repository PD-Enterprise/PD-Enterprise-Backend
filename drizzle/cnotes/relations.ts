import { relations } from "drizzle-orm/relations";
import { user, notes, academicLevel, images } from "./schema";

export const notesRelations = relations(notes, ({ one }) => ({
	user: one(user, {
		fields: [notes.email],
		references: [user.id]
	}),
	academicLevel: one(academicLevel, {
		fields: [notes.academicLevel],
		references: [academicLevel.id]
	}),
}));

export const imagesRelations = relations(images, ({ one }) => ({
	user: one(user, {
		fields: [images.userId],
		references: [user.id]
	}),
}));

export const userRelations = relations(user, ({ many }) => ({
	notes: many(notes),
	images: many(images),
}));

export const academicLevelRelations = relations(academicLevel, ({ many }) => ({
	notes: many(notes),
}));