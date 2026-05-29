import { drizzle } from "drizzle-orm/neon-http";

export function createNotesDb(databaseUrl: string) {
  return drizzle(databaseUrl);
}
