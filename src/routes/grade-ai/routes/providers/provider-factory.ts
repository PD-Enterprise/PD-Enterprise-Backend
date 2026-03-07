import { GroqProvider } from "./groq-provider";
import { ChatRequestBody, InferenceProvider } from "./types";

type ProviderName = ChatRequestBody["provider"];

interface ProviderEnv {
  GROQ_API_KEY: string;
  OPENROUTER_API_KEY: string;
  GEMINI_API_KEY: string;
}

export function resolveProvider(
  provider: ProviderName,
  env: ProviderEnv,
): InferenceProvider {
  switch (provider) {
    case "groq":
      return new GroqProvider(env.GROQ_API_KEY);
    default:
      throw new Error(`Unkown provider: ${provider}`);
  }
}
