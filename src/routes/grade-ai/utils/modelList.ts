type ModelList = {
  providerName: "groq" | "gemini";
  modelName: string;
  modelString: string;
  description: string;
};

export const modelList: ModelList[] = [
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
    description:
      "Best for advanced coding, analysis, and detailed conversations.",
  },
  {
    providerName: "groq",
    modelName: "GPT OSS 20B",
    modelString: "openai/gpt-oss-20b",
    description: "Balanced speed and quality for coding and general use.",
  }
];
