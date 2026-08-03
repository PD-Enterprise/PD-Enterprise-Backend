import type { ChatCompletionTool } from "groq-sdk/resources/chat/completions";

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";

export const WEB_SEARCH_TOOL: ChatCompletionTool = {
  type: "function",
  function: {
    name: "web_search",
    description:
      "Search the web for current, factual, or verifiable information. Use it when the question depends on recent events, statistics, definitions, or specific facts you are unsure about. Call this function with a single JSON object argument that has one required property: a 'query' string, for example {\"query\": \"current world population\"}. Emit the call as a structured function call, never as plain text or XML.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The exact search query to look up on the web. Must be a plain string.",
        },
      },
      required: ["query"],
    },
  },
};

export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
}

interface TavilySearchResponse {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
  }>;
}

export default async function webSearch(
  query: string,
  apiKey: string,
  maxResults = 5,
): Promise<WebSearchResult[]> {
  if (!apiKey) {
    throw new Error("The TAVILY_API_KEY is missing or empty.");
  }

  const response = await fetch(TAVILY_SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      max_results: maxResults,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Tavily search request failed with status ${response.status}: ${await response.text()}`,
    );
  }

  const data = (await response.json()) as TavilySearchResponse;

  return (data.results ?? []).map(({ title, url, content }) => ({
    title: title ?? "",
    url: url ?? "",
    content: content ?? "",
  }));
}

export function formatSearchResults(results: WebSearchResult[]): string {
  if (results.length === 0) {
    return "No relevant web results were found for the query.";
  }
  return results
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.content}`)
    .join("\n\n");
}

export function parseQuery(argumentsString?: string): string | null {
  if (!argumentsString) return null;
  try {
    const parsed = JSON.parse(argumentsString);
    return typeof parsed.query === "string" && parsed.query.trim()
      ? parsed.query
      : null;
  } catch {
    return null;
  }
}
