const TAVILY_SEARCH_URL = "https://api.tavily.com/search";

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
