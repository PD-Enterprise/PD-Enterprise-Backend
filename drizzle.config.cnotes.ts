import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

dotenv.config({ path: ".dev.vars" });

export default defineConfig({
  out: "./drizzle/cnotes",
  schema: "./drizzle/cnotes/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.CNOTES_DB_URL!,
  },
});
