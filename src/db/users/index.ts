import { drizzle as neonDrizzle } from "drizzle-orm/neon-http";

export function createUsersDb(databaseUrl: string) {
  return neonDrizzle(databaseUrl);
}
