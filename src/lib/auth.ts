import { betterAuth } from "better-auth";
import { Bindings } from "../types";
import { allowedUrls } from "@/allowedURLs";

export function createAuth(env: Bindings) {
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: allowedUrls,
    socialProviders: {
      google: {
        clientId: env.GRADE_AI_GOOGLE_CLIENT_ID,
        clientSecret: env.GRADE_AI_GOOGLE_CLIENT_SECRET,
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    }
  });
}
