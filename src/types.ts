export type Bindings = {
  GROQ_API_KEY: string;
  GEMINI_API_KEY: string;
  CONVEX_URL: string;
  DATABASE_URL: string;
  CNOTES_DB_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  GRADE_AI_GOOGLE_CLIENT_ID: string;
  GRADE_AI_GOOGLE_CLIENT_SECRET: string;
};

export type functionReturnType = [
  successState: boolean,
  errorState: boolean,
  message?: string,
  data?: any,
  error?: string,
];
