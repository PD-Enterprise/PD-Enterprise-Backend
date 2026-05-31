import { z } from "zod";

export const noteSchema = z.object({
  title: z.string().min(1).max(255).trim(),
  slug: z.string().min(1).max(255).trim(),

  content: z.string().trim(),

  dateCreated: z.string(),

  academicLevel: z.string().min(1).max(255).trim(),
  topic: z.string().min(1).max(255).trim(),

  type: z.string().min(1),
  visibility: z.string().max(255).trim(),
  year: z.number().int().positive(),
  language: z.string().max(255).trim(),
  keywords: z.string().optional().nullable(),
});

export const chatRequestSchema = z.object({
  prompt: z.string().min(1).max(2000).trim(),
  provider: z.enum(["groq", "gemini"]),
  model: z.string().min(1),
  mode: z.enum(["socratic", "direct"]),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string(),
      }),
    )
    .default([]),
  conversationId: z.string().min(1),
  email: z.string().min(10),
});