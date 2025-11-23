import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle/cnotes",
  schema: "src/drizzle/cnotes/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.CNOTES_DB_URL!,
  },
});
