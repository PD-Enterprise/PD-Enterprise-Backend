import { nanoid } from "nanoid";

/**
 * Generate a slug from a title, with a short unique ID appended.
 *
 * @param title - The note title
 * @returns A unique slug like "my-first-note-aB9x2z"
 */
export function generateSlug(title: string): string {
    const slugPart = title
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")   // replace non-alphanum with "-"
        .replace(/(^-|-$)/g, "");      // remove leading/trailing "-"

    const uniquePart = nanoid(6);

    return `${slugPart}-${uniquePart}`;
}
