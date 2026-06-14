import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Chunk } from "./chunker";
import type { EmbedderMeta } from "./embedder";

export interface StoredChunk extends Chunk {
  embedding: number[];
}

export interface IndexStats {
  chunks: number;
  pages: number;
  embedderMode: string;
  dimensions: number;
  createdAt: string;
}

export interface SearchResult {
  chunk: StoredChunk;
  score: number;
}

export interface SearchOptions {
  k?: number;
  // Cap how many chunks may come from any single page so one long document does
  // not dominate the results.
  maxPerPage?: number;
}

export interface IndexFile {
  version: number;
  createdAt: string;
  embedder: EmbedderMeta;
  chunks: StoredChunk[];
}

const INDEX_VERSION = 1;

// Cosine similarity between two equal length vectors. Returns zero when either
// vector has no magnitude so empty embeddings never crash a search.
export function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// An in memory vector store with cosine search and JSON persistence. It is
// intentionally simple. No external vector database. For workspaces up to a few
// thousand chunks a linear scan is fast and keeps the project self contained.
export class VectorStore {
  private chunks: StoredChunk[];
  private readonly embedderMeta: EmbedderMeta;
  private createdAt: string;

  constructor(embedderMeta: EmbedderMeta, chunks: StoredChunk[] = [], createdAt?: string) {
    this.embedderMeta = embedderMeta;
    this.chunks = chunks;
    this.createdAt = createdAt ?? new Date().toISOString();
  }

  get embedder(): EmbedderMeta {
    return this.embedderMeta;
  }

  get size(): number {
    return this.chunks.length;
  }

  get pageCount(): number {
    return new Set(this.chunks.map((c) => c.pageId)).size;
  }

  getAll(): readonly StoredChunk[] {
    return this.chunks;
  }

  addChunks(chunks: StoredChunk[]): void {
    this.chunks.push(...chunks);
  }

  removeByPage(pageId: string): void {
    this.chunks = this.chunks.filter((c) => c.pageId !== pageId);
  }

  // Replace all chunks for a page. Used for incremental re indexing.
  upsertPage(pageId: string, chunks: StoredChunk[]): void {
    this.removeByPage(pageId);
    this.addChunks(chunks);
  }

  hasPage(pageId: string): boolean {
    return this.chunks.some((c) => c.pageId === pageId);
  }

  search(queryEmbedding: number[], options: SearchOptions = {}): SearchResult[] {
    const k = options.k ?? 5;
    const maxPerPage = options.maxPerPage ?? Infinity;
    const scored = this.chunks
      .map((chunk) => ({ chunk, score: cosineSimilarity(queryEmbedding, chunk.embedding) }))
      .sort((a, b) => b.score - a.score);

    const perPage = new Map<string, number>();
    const results: SearchResult[] = [];
    for (const result of scored) {
      const used = perPage.get(result.chunk.pageId) ?? 0;
      if (used >= maxPerPage) continue;
      perPage.set(result.chunk.pageId, used + 1);
      results.push(result);
      if (results.length >= k) break;
    }
    return results;
  }

  stats(): IndexStats {
    return {
      chunks: this.size,
      pages: this.pageCount,
      embedderMode: this.embedderMeta.mode,
      dimensions: this.embedderMeta.dimensions,
      createdAt: this.createdAt,
    };
  }

  toJSON(): IndexFile {
    return {
      version: INDEX_VERSION,
      createdAt: this.createdAt,
      embedder: this.embedderMeta,
      chunks: this.chunks,
    };
  }

  static fromJSON(data: IndexFile): VectorStore {
    return new VectorStore(data.embedder, data.chunks, data.createdAt);
  }

  async save(path: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(this.toJSON()), "utf8");
  }

  static async load(path: string): Promise<VectorStore> {
    const raw = await readFile(path, "utf8");
    return VectorStore.fromJSON(JSON.parse(raw) as IndexFile);
  }
}
