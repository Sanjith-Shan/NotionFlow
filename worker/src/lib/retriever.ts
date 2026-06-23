// A small, dependency free TF-IDF retriever. This is a trimmed standalone copy
// of NotionFlow's retrieval core so the Worker bundles and deploys on its own
// without pulling in the whole repository. The full, chunk aware implementation
// lives in the main package under src/embeddings.

export interface CorpusPage {
  id: string;
  title: string;
  url: string;
  markdown: string;
  tags: string[];
  status?: string;
  lastEdited: string;
  databaseId: string | null;
  parentTitle?: string;
}

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "of",
  "to",
  "in",
  "on",
  "for",
  "with",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "it",
  "this",
  "that",
  "these",
  "those",
  "as",
  "at",
  "by",
  "from",
  "we",
  "our",
  "you",
  "your",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function normalize(vector: number[]): number[] {
  let norm = 0;
  for (const v of vector) norm += v * v;
  norm = Math.sqrt(norm);
  return norm === 0 ? vector : vector.map((v) => v / norm);
}

export function cosine(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < len; i += 1) dot += (a[i] ?? 0) * (b[i] ?? 0);
  return dot; // vectors are pre normalized
}

export interface ScoredPage {
  page: CorpusPage;
  score: number;
}

// Builds a TF-IDF model over a corpus and embeds both documents and queries
// with the same vocabulary.
export class Retriever {
  readonly pages: CorpusPage[];
  private readonly vocab: Map<string, number>;
  private readonly idf: number[];
  private readonly vectors: number[][];

  constructor(pages: CorpusPage[]) {
    this.pages = pages;
    const texts = pages.map((p) => `${p.title}\n${p.markdown}`);

    const df = new Map<string, number>();
    for (const text of texts) {
      for (const term of new Set(tokenize(text))) df.set(term, (df.get(term) ?? 0) + 1);
    }
    this.vocab = new Map();
    this.idf = [];
    let col = 0;
    for (const [term, count] of [...df.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      this.vocab.set(term, col);
      this.idf[col] = Math.log((1 + texts.length) / (1 + count)) + 1;
      col += 1;
    }
    this.vectors = texts.map((t) => this.embed(t));
  }

  embed(text: string): number[] {
    const vector = new Array<number>(this.idf.length).fill(0);
    const tokens = tokenize(text);
    if (tokens.length === 0) return vector;
    const counts = new Map<number, number>();
    for (const token of tokens) {
      const c = this.vocab.get(token);
      if (c === undefined) continue;
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    for (const [c, n] of counts) vector[c] = (n / tokens.length) * (this.idf[c] ?? 0);
    return normalize(vector);
  }

  search(query: string, k: number): ScoredPage[] {
    const q = this.embed(query);
    return this.pages
      .map((page, i) => ({ page, score: cosine(q, this.vectors[i] ?? []) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  similarTo(vector: number[], k: number, excludeId?: string): ScoredPage[] {
    return this.pages
      .map((page, i) => ({ page, score: cosine(vector, this.vectors[i] ?? []) }))
      .filter((r) => r.page.id !== excludeId)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}
