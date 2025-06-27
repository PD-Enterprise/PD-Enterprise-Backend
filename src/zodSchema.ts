import { z } from "zod";

export const noteSchema = z.object({
    email: z.string().email().trim().toLowerCase(),
    note: z.object({
        title: z.string().min(1).max(255).trim(),
        notescontent: z.string().max(5000).trim(), // adjust max as needed
        board: z.string().max(255).trim().optional(),
        dateCreated: z.string().optional(),
        dateUpdated: z.string().optional(),
        grade: z.string().max(50).trim(),
        subject: z.string().max(100).trim(),
    }),
});
