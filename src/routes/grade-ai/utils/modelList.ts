type ModelList = {
  providerName: "groq" | "gemini" | "cloudflare";
  modelName: string;
  modelString: string;
  description: string;
};

export const modelList: ModelList[] = [
  {
    providerName: "groq",
    modelName: "GPT OSS 120B",
    modelString: "openai/gpt-oss-120b",
    description:
      "Best for advanced coding, analysis, and detailed conversations.",
  },
  {
    providerName: "groq",
    modelName: "GPT OSS 20B",
    modelString: "openai/gpt-oss-20b",
    description: "Balanced speed and quality for coding and general use.",
  },
  {
    providerName: "gemini",
    modelName: "Gemini 2.1 Flash",
    modelString: "gemini-2.1-flash",
    description: "Best for advanced coding, analysis, and detailed conversations.",
  },
  {
    providerName: "gemini",
    modelName: "Gemini 2.1 Flash Lite",
    modelString: "gemini-2.1-flash-lite",
    description: "Best for advanced coding, analysis, and detailed conversations.",
  },
  {
    providerName: "cloudflare",
    modelName: "Llama 3.1 8B Instruct",
    modelString: "@cf/meta/llama-3.1-8b-instruct",
    description: "Fast general-purpose chat model on Workers AI.",
  },
  {
    providerName: "cloudflare",
    modelName: "Llama 3.3 70B Instruct FP8 Fast",
    modelString: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    description: "Higher quality reasoning and instruction following on Workers AI.",
  },
];

/** modelString -> provider allowlist. Single source of truth for validation. */
export const ALLOWED_CHAT_MODELS = new Map(
  modelList.map((m) => [m.modelString, m.providerName]),
);
