import { drizzle as neonDrizzle } from "drizzle-orm/neon-http";
import { drizzle as pgDrizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

export function createUsersDb(databaseUrl: string) {
  return neonDrizzle(databaseUrl);
}
