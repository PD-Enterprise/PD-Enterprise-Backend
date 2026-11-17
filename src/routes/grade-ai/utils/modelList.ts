type ModelList = {
  providerName: "groq" | "gemini" | "cloudflare";
  modelName: string;
  modelString: string;
  description: string;
  /**
   * Whether the model supports native tool/function calling over its
   * provider's SDK path. When false or omitted, the provider streams plain
   * chat without attaching tools (and the system prompt omits tool
   * instructions). Only vetted Cloudflare models are marked true.
   */
  supportsTools?: boolean;
};

export const modelList: ModelList[] = [
  {
    providerName: "groq",
    modelName: "GPT-OSS 120B",
    modelString: "openai/gpt-oss-120b",
    description: "Best for advanced coding, analysis, and detailed conversations.",
  },
  {
    providerName: "groq",
    modelName: "GPT-OSS 20B",
    modelString: "openai/gpt-oss-20b",
    description: "Balanced speed and quality for coding and general use.",
  },
  {
    providerName: "cloudflare",
    modelName: "Llama 3.3 70B",
    modelString: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    description: "Higher quality reasoning and instruction following.",
  },
  {
    providerName: "cloudflare",
    modelName: "GLM 4.7 Flash",
    modelString: "@cf/zai-org/glm-4.7-flash",
    description: "Fast multilingual text generation model with tool calling support.",
    supportsTools: true,
  }
];

/** modelString -> provider allowlist. Single source of truth for validation. */
export const ALLOWED_CHAT_MODELS = new Map(
  modelList.map((m) => [m.modelString, m.providerName]),
);

/** Cloudflare (and any future) models vetted for native tool calling. */
const TOOL_CAPABLE_MODELS = new Set(
  modelList.filter((m) => m.supportsTools).map((m) => m.modelString),
);

/**
 * Whether a model is vetted for native tool/function calling. Unknown or
 * unmarked models return false so tools stay off by default.
 */
export function modelSupportsTools(modelString: string | undefined): boolean {
  if (!modelString) return false;
  return TOOL_CAPABLE_MODELS.has(modelString);
}

/**
 * Whether a provider/model pair should attach tools and include tool
 * instructions. Groq always supports tools; Gemini uses native grounding
 * (handled separately); Cloudflare depends on the per-model capability flag.
 */
export function providerSupportsTools(
  provider: "groq" | "gemini" | "cloudflare",
  modelString: string | undefined,
): boolean {
  if (provider === "groq") return true;
  if (provider === "gemini") return true;
  return modelSupportsTools(modelString);
}
