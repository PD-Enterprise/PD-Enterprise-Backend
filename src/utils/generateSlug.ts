import { nanoid } from "nanoid";

export function generateSlug(title: string): string {
  const slugPart = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-") // replace non-alphanum with "-"
    .replace(/(^-|-$)/g, ""); // remove leading/trailing "-"

  const uniquePart = nanoid(6);

  const fullSlug = `${slugPart}-${uniquePart}`;

  return fullSlug;
}
