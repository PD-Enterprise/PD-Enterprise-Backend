import { z } from "zod";

export const noteSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  note: z.object({
    title: z.string().min(1).max(255).trim(),
    slug: z.string().min(1).max(255).trim().optional(),

    content: z.string().max(5000).trim(),

    dateCreated: z.string(),

    academicLevel: z.string().min(1).max(255).trim(),
    topic: z.string().min(1).max(255).trim(),

    type: z.string().min(1),
    visibility: z.string().max(255).trim(),
    year: z.number().int().positive(),
    language: z.string().max(255).trim(),
    keywords: z.string().optional(),
  }),
});
