import { tavily } from "@tavily/core";

export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
}

export default async function webSearch(
  query: string,
  apiKey: string,
  maxResults = 5,
): Promise<WebSearchResult[]> {
  if (!apiKey) {
    throw new Error("The TAVILY_API_KEY is missing or empty.");
  }

  const client = tavily({ apiKey });
  const response = await client.search(query, {
    searchDepth: "basic",
    maxResults,
  });

  return response.results.map(({ title, url, content }) => ({
    title,
    url,
    content,
  }));
}
