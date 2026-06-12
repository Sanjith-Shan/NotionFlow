import { vi } from "vitest";
import type { Embedder, EmbedderMeta } from "../src/embeddings/embedder";
import type { StoredChunk } from "../src/embeddings/store";
import type { CrawledPage } from "../src/notion/types";

// A controllable embedder for tests. Maps each input text to a vector with the
// provided function and records its calls.
export class FakeEmbedder implements Embedder {
  readonly mode: "openai" | "tfidf";
  readonly dimensions: number;
  embed!: (texts: string[]) => Promise<number[][]>;

  constructor(
    private readonly fn: (text: string) => number[],
    opts: { mode?: "openai" | "tfidf"; dimensions?: number } = {},
  ) {
    this.mode = opts.mode ?? "tfidf";
    this.dimensions = opts.dimensions ?? fn("").length ?? 2;
    this.embed = vi.fn(async (texts: string[]) => texts.map((t) => this.fn(t)));
  }

  meta(): EmbedderMeta {
    return this.mode === "openai"
      ? { mode: "openai", dimensions: this.dimensions, model: "fake" }
      : { mode: "tfidf", dimensions: this.dimensions, tfidf: { vocab: {}, idf: [] } };
  }
}

export function makeStoredChunk(
  partial: Partial<StoredChunk> & { embedding: number[] },
): StoredChunk {
  return {
    id: partial.id ?? `${partial.pageId ?? "page"}#${partial.chunkIndex ?? 0}`,
    pageId: partial.pageId ?? "page",
    pageTitle: partial.pageTitle ?? "Page",
    sectionHeading: partial.sectionHeading ?? "Page",
    text: partial.text ?? "text",
    chunkIndex: partial.chunkIndex ?? 0,
    url: partial.url ?? "https://notion.so/page",
    lastEdited: partial.lastEdited ?? "2026-06-01T00:00:00.000Z",
    embedding: partial.embedding,
  };
}

export function makeCrawledPage(partial: Partial<CrawledPage> = {}): CrawledPage {
  return {
    id: partial.id ?? "page-1",
    title: partial.title ?? "Page 1",
    url: partial.url ?? "https://notion.so/page1",
    markdown: partial.markdown ?? "Some content.",
    lastEdited: partial.lastEdited ?? "2026-06-01T00:00:00.000Z",
    parentId: partial.parentId ?? null,
    parentTitle: partial.parentTitle ?? null,
    databaseId: partial.databaseId ?? null,
    properties: partial.properties ?? { tags: [] },
  };
}
