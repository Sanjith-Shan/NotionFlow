import type { Embedder } from "../embeddings/embedder";
import { cosineSimilarity } from "../embeddings/store";
import type { WorkspaceSnapshot } from "../notion/types";

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

export interface TaggablePage {
  pageId: string;
  pageTitle: string;
  pageUrl: string;
  tags: string[];
  embedding: number[];
}

export interface SuggestTagsOptions {
  // How many similar tagged pages to consider.
  neighbors?: number;
  // Minimum number of neighbors that must share a tag for it to be suggested.
  minVotes?: number;
}

// Pure tag suggestion. Given a target page and a pool of already tagged pages,
// find the most similar tagged pages and suggest the tags they share. Confidence
// is the fraction of considered neighbors that carry the tag.
export function suggestTags(
  target: TaggablePage,
  taggedPages: TaggablePage[],
  options: SuggestTagsOptions = {},
): TagSuggestion[] {
  const neighbors = options.neighbors ?? 5;
  const minVotes = options.minVotes ?? 2;

  const ranked = taggedPages
    .filter((p) => p.pageId !== target.pageId && p.tags.length > 0)
    .map((p) => ({ page: p, score: cosineSimilarity(target.embedding, p.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, neighbors);

  if (ranked.length === 0) return [];

  const votes = new Map<string, number>();
  for (const { page } of ranked) {
    for (const tag of new Set(page.tags)) {
      votes.set(tag, (votes.get(tag) ?? 0) + 1);
    }
  }

  return [...votes.entries()]
    .filter(([, count]) => count >= minVotes)
    .map(([tag, count]) => ({ tag, confidence: Math.round((count / ranked.length) * 100) / 100 }))
    .sort((a, b) => b.confidence - a.confidence);
}

function pageText(title: string, markdown: string): string {
  return `${title}\n\n${markdown.slice(0, 2000)}`;
}

// Suggest tags for every untagged page in a database. Embeds each page once,
// then runs the pure suggester against the tagged pages in the same database.
export async function suggestTagsForDatabase(
  snapshot: WorkspaceSnapshot,
  databaseId: string,
  embedder: Embedder,
  options: SuggestTagsOptions = {},
): Promise<PageTagSuggestions[]> {
  const pages = snapshot.pages.filter((p) => p.databaseId === databaseId);
  if (pages.length === 0) return [];

  const embeddings = await embedder.embed(pages.map((p) => pageText(p.title, p.markdown)));
  const taggable: TaggablePage[] = pages.map((p, i) => ({
    pageId: p.id,
    pageTitle: p.title,
    pageUrl: p.url,
    tags: p.properties.tags ?? [],
    embedding: embeddings[i] ?? [],
  }));

  const tagged = taggable.filter((p) => p.tags.length > 0);
  const untagged = taggable.filter((p) => p.tags.length === 0);

  return untagged
    .map((target) => ({
      pageId: target.pageId,
      pageTitle: target.pageTitle,
      pageUrl: target.pageUrl,
      suggestions: suggestTags(target, tagged, options),
    }))
    .filter((result) => result.suggestions.length > 0);
}
