import { GeminiProvider } from "./gemini-provider";
import { GroqProvider } from "./groq-provider";
import { OpenRouterProvider } from "./openrouter-provider";
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
    case "openrouter":
      return new OpenRouterProvider(env.OPENROUTER_API_KEY);
    case "gemini":
      return new GeminiProvider(env.GEMINI_API_KEY);
    default:
      throw new Error(`Unkown provider: ${provider}`);
  }
}
