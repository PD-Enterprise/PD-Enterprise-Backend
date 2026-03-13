type ModelList = {
  providerName: "groq" | "openrouter" | "gemini";
  modelName: string;
  modelString: string;
  description: string;
};

export const modelList: ModelList[] = [
  {
    providerName: "groq",
    modelName: "Llama 3.1 8B",
    modelString: "llama-3.1-8b-instant",
    description: "llama-3.1-8b-instant is a language model trained by Meta",
  },
  {
    providerName: "groq",
    modelName: "GPT OSS 20B",
    modelString: "openai/gpt-oss-20b",
    description: "gpt-oss-20b is a language model trained by OpenAI",
  },
  {
    providerName: "openrouter",
    modelName: "Qwen 3 4B",
    modelString: "qwen/qwen3-4b:free",
    description: "Qwen 3.4 4B is a language model trained by Alibaba",
  },
  {
    providerName: "gemini",
    modelName: "Gemini 2.5 Flash",
    modelString: "gemini-2.5-flash",
    description: "Gemini 2.5 Flash is a language model trained by Google",
  },
];
