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

export interface WebSearchImage {
  url: string;
  description: string;
  sourceUrl: string;
}

interface TavilyImage {
  url?: string;
  description?: string;
}

interface TavilySearchResponse {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    images?: (string | TavilyImage)[];
  }>;
  images?: (string | TavilyImage)[];
}

export interface WebSearchResponse {
  results: WebSearchResult[];
  images: WebSearchImage[];
}

const MAX_IMAGES = 6;

function isHttpsUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeImage(
  entry: string | TavilyImage | undefined,
  sourceUrl: string,
): WebSearchImage | null {
  const url = typeof entry === "string" ? entry : entry?.url;
  if (!isHttpsUrl(url)) return null;
  const description =
    (typeof entry === "object" ? entry?.description : "")?.trim() ?? "";
  return { url, description, sourceUrl };
}

function collectImages(data: TavilySearchResponse): WebSearchImage[] {
  const seen = new Set<string>();
  const images: WebSearchImage[] = [];
  const push = (entry: string | TavilyImage | undefined, sourceUrl: string) => {
    if (images.length >= MAX_IMAGES) return;
    const normalized = normalizeImage(entry, sourceUrl);
    if (!normalized || seen.has(normalized.url)) return;
    seen.add(normalized.url);
    images.push(normalized);
  };
  for (const entry of data.images ?? []) push(entry, "");
  for (const result of data.results ?? []) {
    for (const entry of result.images ?? []) {
      push(entry, result.url ?? "");
    }
  }
  return images;
}

export default async function webSearch(
  query: string,
  apiKey: string,
  maxResults = 5,
): Promise<WebSearchResponse> {
  if (!apiKey) {
    console.error("[webSearch] search service is not configured");
    throw new Error("Search service is not configured.");
  }

  let response: Response;
  try {
    response = await fetch(TAVILY_SEARCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        max_results: maxResults,
        include_images: true,
        include_image_descriptions: true,
      }),
    });
  } catch (err) {
    console.error("[webSearch] search request failed:", err);
    throw new Error("Search service is temporarily unavailable.");
  }

  if (!response.ok) {
    let detail = "";
    try {
      detail = await response.text();
    } catch {
      detail = "";
    }
    console.error("[webSearch] search request failed", {
      status: response.status,
      detail: detail.slice(0, 500),
    });
    throw new Error(
      `Search service is temporarily unavailable (status ${response.status}).`,
    );
  }

  const data = (await response.json()) as TavilySearchResponse;

  const results = (data.results ?? []).map(({ title, url, content }) => ({
    title: title ?? "",
    url: url ?? "",
    content: content ?? "",
  }));

  return { results, images: collectImages(data) };
}

export function formatSearchResults(
  results: WebSearchResult[],
  images: WebSearchImage[] = [],
): string {
  const text =
    results.length === 0
      ? "No relevant web results were found for the query."
      : results
          .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.content}`)
          .join("\n\n");
  if (images.length === 0) return text;
  const imageLines = images
    .map(
      (img, i) =>
        `- Image ${i + 1}: ${img.url}${img.description ? ` — ${img.description}` : ""}${img.sourceUrl ? ` (source: ${img.sourceUrl})` : ""}`,
    )
    .join("\n");
  return `${text}\n\nImages (verified — to include an image, emit standard markdown ![short description](VERIFIED_URL) on its own line using only these exact URLs, max 3 per reply; never invent image URLs):\n${imageLines}`;
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
