type ModelList = {
  providerName: "groq" | "gemini";
  modelName: string;
  modelString: string;
  description: string;
};

export const modelList: ModelList[] = [
  {
    providerName: "groq",
    modelName: "Llama 3.1 8B Instant",
    modelString: "llama-3.1-8b-instant",
    description: "Fast responses for everyday chats, coding, and questions.",
  },
  {
    providerName: "groq",
    modelName: "Llama 3.3 70B Versatile",
    modelString: "llama-3.3-70b-versatile",
    description: "Stronger reasoning and writing for more complex tasks.",
  },
  {
    providerName: "groq",
    modelName: "GPT OSS 120B",
    modelString: "openai/gpt-oss-120b",
    description: "Best for advanced coding, analysis, and detailed conversations.",
  },
  {
    providerName: "groq",
    modelName: "GPT OSS 20B",
    modelString: "openai/gpt-oss-20b",
    description: "Balanced speed and quality for coding and general use.",
  },
  {
    providerName: "groq",
    modelName: "Qwen3 32B",
    modelString: "qwen/qwen3-32b",
    description: "Great for coding, reasoning, and multilingual tasks.",
  },
  {
    providerName: "gemini",
    modelName: "Gemini 2.5 Flash Lite",
    modelString: "gemini-2.5-flash-lite",
    description: "Ultra-fast model for simple questions and everyday tasks.",
  },
  {
    providerName: "gemini",
    modelName: "Gemini 2.5 Flash",
    modelString: "gemini-2.5-flash",
    description: "Fast and capable for coding, writing, and problem solving.",
  },
  {
    providerName: "gemini",
    modelName: "Gemini 3.1 Flash Lite",
    modelString: "gemini-3.1-flash-lite",
    description: "Lightweight model optimized for quick and simple requests.",
  },
  {
    providerName: "gemini",
    modelName: "Gemini 3.2 Flash",
    modelString: "gemini-3.5-flash",
    description: "Powerful all-round model for coding, reasoning, and creative work.",
  },
];