// Typed client for the NotionFlow API. The shapes mirror the server responses.
// They are declared here so the web bundle stays self contained.

export interface Stats {
  pages: number;
  chunks: number;
  embedderMode: string;
  dimensions: number;
  createdAt: string;
  source: string;
  provider: string;
}

export interface Source {
  pageId: string;
  pageTitle: string;
  pageUrl: string;
  relevanceScore: number;
  snippet: string;
}

export interface Answer {
  answer: string;
  sources: Source[];
  usedModel: string;
}

export interface Database {
  id: string;
  title: string;
  dataSourceId: string;
  tagOptions: string[];
}

export interface TagSuggestion {
  tag: string;
  confidence: number;
}

export interface PageTagSuggestions {
  pageId: string;
  pageTitle: string;
  pageUrl: string;
  suggestions: TagSuggestion[];
}

export interface DigestGroup {
  title: string;
  summary: string;
  pages: Array<{ title: string; url: string; lastEdited: string }>;
}

export interface Digest {
  since: string;
  pageCount: number;
  groups: DigestGroup[];
}

export interface CreatedPage {
  title: string;
  markdown: string;
  id: string;
  url: string;
  created: boolean;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? response.statusText);
  }
  return (await response.json()) as T;
}

function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export const api = {
  stats: () => request<Stats>("/api/stats"),
  search: (query: string, maxResults?: number) =>
    post<Answer>("/api/search", { query, maxResults }),
  databases: () => request<Database[]>("/api/databases"),
  tag: (databaseId: string) => post<PageTagSuggestions[]>("/api/tag", { databaseId }),
  applyTags: (pageId: string, tags: string[]) =>
    post<{ applied: boolean }>("/api/tag/apply", { pageId, tags }),
  digest: (days: number) => post<Digest>("/api/digest", { days }),
  create: (prompt: string, parentId?: string) =>
    post<CreatedPage>("/api/create", { prompt, parentId }),
  reindex: () => post<Stats>("/api/index", {}),
};
