import { z } from "zod";
import { ALLOWED_CHAT_MODELS } from "@/src/routes/grade-ai/utils/modelList";

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

export const chatRequestSchema = z
  .object({
    prompt: z.string().min(1).max(2000).trim(),
    provider: z.enum(["groq", "gemini"]),
    model: z.string().min(1).max(128),
    mode: z.enum(["socratic", "direct"]),
    history: z
      .array(
        z.object({
          role: z.enum(["user", "assistant", "system"]),
          content: z.string().max(2000),
        }),
      )
      .max(40)
      .default([]),
    conversationId: z.string().min(1).max(128),
    messageClientId: z.string().min(1).max(128),
    assistantClientId: z.string().min(1).max(128),
  })
  .superRefine((data, ctx) => {
    const expected = ALLOWED_CHAT_MODELS.get(data.model);
    if (!expected) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["model"],
        message: "Unsupported model",
      });
      return;
    }
    if (expected !== data.provider) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["provider"],
        message: `Model ${data.model} requires provider "${expected}"`,
      });
    }
  });

export const userObjectSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  picture: z.string().min(1).max(255).trim().nullable(),
})