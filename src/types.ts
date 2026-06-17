export type Bindings = {
  GROQ_API_KEY: string;
  GEMINI_API_KEY: string;
  CONVEX_URL: string;
  DATABASE_URL: string;
  CNOTES_DB_URL: string;
  AUTH_SECRET: string;
};

export type functionReturnType = [
  successState: boolean,
  errorState: boolean,
  message?: string,
  data?: any,
  error?: string,
];

export type userObject = {
  name: string;
  email: string;
  picture: string;
}

export type AppVariables = {
  user: userObject | undefined
}