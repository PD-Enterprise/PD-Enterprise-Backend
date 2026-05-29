import { drizzle } from "drizzle-orm/neon-http";

export function createUsersDb(databaseUrl: string) {
  return drizzle(databaseUrl);
}
