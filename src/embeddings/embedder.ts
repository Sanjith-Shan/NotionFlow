import OpenAI from "openai";

// An embedder turns text into vectors. NotionFlow ships two. An OpenAI backed
// embedder for real quality, and a dependency free TF-IDF embedder so the whole
// pipeline runs with no API key at all.
export interface Embedder {
  readonly mode: "openai" | "tfidf";
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
  meta(): EmbedderMeta;
}

// Serializable description of an embedder. Persisted alongside the index so
// queries are embedded the same way the corpus was.
export type EmbedderMeta =
  | { mode: "openai"; dimensions: number; model: string }
  | { mode: "tfidf"; dimensions: number; tfidf: TfidfModelData };

export const OPENAI_EMBED_MODEL = "text-embedding-3-small";
const OPENAI_DIMENSIONS = 1536;
const OPENAI_BATCH = 100;

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
  "they",
  "their",
  "i",
  "he",
  "she",
  "his",
  "her",
  "its",
  "if",
  "so",
  "not",
  "no",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

export interface TfidfModelData {
  vocab: Record<string, number>; // term to column index
  idf: number[]; // idf weight per column
}

function l2normalize(vector: number[]): number[] {
  let norm = 0;
  for (const v of vector) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm === 0) return vector;
  return vector.map((v) => v / norm);
}

// A small TF-IDF embedder. It is fit on the corpus once, then used to embed
// both stored chunks and incoming queries with the same vocabulary.
export class TfidfEmbedder implements Embedder {
  readonly mode = "tfidf" as const;
  private readonly vocab: Record<string, number>;
  private readonly idf: number[];

  constructor(data: TfidfModelData) {
    this.vocab = data.vocab;
    this.idf = data.idf;
  }

  get dimensions(): number {
    return this.idf.length;
  }

  // Build a vocabulary and inverse document frequencies from a corpus.
  static fit(corpus: string[]): TfidfEmbedder {
    const df = new Map<string, number>();
    for (const doc of corpus) {
      const seen = new Set(tokenize(doc));
      for (const term of seen) df.set(term, (df.get(term) ?? 0) + 1);
    }
    const terms = [...df.keys()].sort();
    const vocab: Record<string, number> = {};
    const idf: number[] = [];
    const n = corpus.length;
    terms.forEach((term, index) => {
      vocab[term] = index;
      idf[index] = Math.log((1 + n) / (1 + (df.get(term) ?? 0))) + 1;
    });
    return new TfidfEmbedder({ vocab, idf });
  }

  private transform(text: string): number[] {
    const vector = new Array<number>(this.idf.length).fill(0);
    const tokens = tokenize(text);
    if (tokens.length === 0) return vector;
    const counts = new Map<number, number>();
    for (const token of tokens) {
      const col = this.vocab[token];
      if (col === undefined) continue;
      counts.set(col, (counts.get(col) ?? 0) + 1);
    }
    for (const [col, count] of counts) {
      vector[col] = (count / tokens.length) * (this.idf[col] ?? 0);
    }
    return l2normalize(vector);
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.transform(t));
  }

  meta(): EmbedderMeta {
    return {
      mode: "tfidf",
      dimensions: this.dimensions,
      tfidf: { vocab: this.vocab, idf: this.idf },
    };
  }
}

// OpenAI backed embedder using the small, cheap embedding model.
export class OpenAiEmbedder implements Embedder {
  readonly mode = "openai" as const;
  readonly dimensions = OPENAI_DIMENSIONS;
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey: string, model: string = OPENAI_EMBED_MODEL) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += OPENAI_BATCH) {
      const batch = texts.slice(i, i + OPENAI_BATCH);
      const response = await this.client.embeddings.create({ model: this.model, input: batch });
      for (const item of response.data) out.push(item.embedding);
    }
    return out;
  }

  meta(): EmbedderMeta {
    return { mode: "openai", dimensions: this.dimensions, model: this.model };
  }
}

export interface EmbedderConfig {
  openaiKey?: string;
  forceTfidf?: boolean;
}

// Pick an embedder for building an index. When no OpenAI key is available, or
// TF-IDF is forced, fit a TF-IDF model on the corpus.
export function createEmbedderForCorpus(corpus: string[], config: EmbedderConfig): Embedder {
  if (config.openaiKey && !config.forceTfidf) {
    return new OpenAiEmbedder(config.openaiKey);
  }
  return TfidfEmbedder.fit(corpus);
}

// Rebuild the exact embedder described by stored metadata, used at query time.
export function createEmbedderFromMeta(meta: EmbedderMeta, config: EmbedderConfig): Embedder {
  if (meta.mode === "tfidf") {
    return new TfidfEmbedder(meta.tfidf);
  }
  if (!config.openaiKey) {
    throw new Error(
      "This index was built with OpenAI embeddings but no OPENAI_API_KEY is set. Re-index to use the TF-IDF fallback.",
    );
  }
  return new OpenAiEmbedder(config.openaiKey, meta.model);
}
