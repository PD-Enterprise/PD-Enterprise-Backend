import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

dotenv.config({ path: ".dev.vars" });

export default defineConfig({
  out: "./drizzle/users",
  schema: "./drizzle/users/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
