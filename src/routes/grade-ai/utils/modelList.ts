type ModelList = {
  providerName: "groq" | "gemini";
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
    modelName: "Gemini 2.5 Flash",
    modelString: "gemini-2.5-flash",
    description: "Best for advanced coding, analysis, and detailed conversations.",
  },
  {
    providerName: "gemini",
    modelName: "Gemini 2.5 Flash Lite",
    modelString: "gemini-2.5-flash-lite",
    description: "Balanced speed and quality for coding and general use.",
  }
];
