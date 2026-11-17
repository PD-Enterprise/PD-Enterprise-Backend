import { CloudflareProvider } from "./cloudflare-provider";
import { GeminiProvider } from "./gemini-provider";
import { GroqProvider } from "./groq-provider";
import { ChatRequestBody, InferenceProvider } from "./types";
import { ALLOWED_CHAT_MODELS, modelSupportsTools } from "../../utils/modelList";

type ProviderName = ChatRequestBody["provider"];

interface ProviderEnv {
  GROQ_API_KEY: string;
  GEMINI_API_KEY: string;
  TAVILY_API_KEY: string;
  AI?: any;
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
    case "cloudflare": {
      if (!env.AI) {
        throw new Error("The AI binding is missing.");
      }
      const supportsTools = modelSupportsTools(model);
      if (supportsTools && !env.TAVILY_API_KEY) {
        // Not fatal: the tool loop degrades to a recoverable search failure
        // and the model still answers from its own knowledge.
        console.warn(
          "[grade-ai] TAVILY_API_KEY is missing; web_search will fail recoverably for",
          model,
        );
      }
      return new CloudflareProvider(
        env.AI,
        env.TAVILY_API_KEY,
        supportsTools,
      );
    }
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
