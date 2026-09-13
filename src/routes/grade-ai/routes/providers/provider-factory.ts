import { GeminiProvider } from "./gemini-provider";
import { GroqProvider } from "./groq-provider";
import { ChatRequestBody, InferenceProvider } from "./types";
import { ALLOWED_CHAT_MODELS } from "../../utils/modelList";

type ProviderName = ChatRequestBody["provider"];

interface ProviderEnv {
  GROQ_API_KEY: string;
  GEMINI_API_KEY: string;
  TAVILY_API_KEY: string;
}

export function resolveProvider(
  provider: ProviderName,
  env: ProviderEnv,
  model?: string,
): InferenceProvider {
  // Defense-in-depth: even if request validation is bypassed, never let a
  // caller pick an arbitrary model string (cost / capability escalation).
  if (model !== undefined) {
    const expected = ALLOWED_CHAT_MODELS.get(model);
    if (!expected) {
      throw new Error(`Unsupported model: ${model}`);
    }
    if (expected !== provider) {
      throw new Error(
        `Model ${model} requires provider "${expected}" (got "${provider}")`,
      );
    }
  }
  switch (provider) {
    case "groq":
      return new GroqProvider(env.GROQ_API_KEY, env.TAVILY_API_KEY);
    case "gemini":
      return new GeminiProvider(env.GEMINI_API_KEY, env.TAVILY_API_KEY);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
