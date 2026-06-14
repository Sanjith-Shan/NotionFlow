import type { CrawledPage } from "../notion/types";
import { chunkPage } from "./chunker";
import { createEmbedderForCorpus, type Embedder, type EmbedderConfig } from "./embedder";
import { VectorStore, type StoredChunk } from "./store";

export interface BuildIndexOptions {
  // A previous index. When the embedder is OpenAI backed, embeddings for chunks
  // whose text is unchanged are reused so re indexing only pays to embed new or
  // edited content.
  previous?: VectorStore;
  // Inject an embedder directly. Used by tests and by callers that already know
  // which embedder to use.
  embedder?: Embedder;
}

// Build a vector index from crawled pages. Chunks every page, embeds the chunk
// text, and returns a ready to search store.
export async function buildIndex(
  pages: CrawledPage[],
  config: EmbedderConfig,
  options: BuildIndexOptions = {},
): Promise<VectorStore> {
  const allChunks = allPageChunks(pages);
  const texts = allChunks.map((c) => c.text);
  const embedder = options.embedder ?? createEmbedderForCorpus(texts, config);

  // Reuse prior embeddings only when it is safe. TF-IDF vectors depend on the
  // whole corpus, so they are always rebuilt. OpenAI vectors are stable per
  // text, so unchanged chunks can be carried over.
  const reuse = new Map<string, number[]>();
  if (
    options.previous &&
    embedder.mode === "openai" &&
    options.previous.embedder.mode === "openai"
  ) {
    for (const chunk of options.previous.getAll()) {
      if (chunk.embedding.length === embedder.dimensions) reuse.set(chunk.text, chunk.embedding);
    }
  }

  const pending: { index: number; text: string }[] = [];
  const stored: StoredChunk[] = allChunks.map((chunk, index) => {
    const cached = reuse.get(chunk.text);
    if (cached) return { ...chunk, embedding: cached };
    pending.push({ index, text: chunk.text });
    return { ...chunk, embedding: [] };
  });

  if (pending.length > 0) {
    const vectors = await embedder.embed(pending.map((p) => p.text));
    pending.forEach((p, j) => {
      const base = stored[p.index];
      if (base) base.embedding = vectors[j] ?? [];
    });
  }

  return new VectorStore(embedder.meta(), stored);
}

export function allPageChunks(pages: CrawledPage[]): StoredChunk[] {
  return pages.flatMap((page) => chunkPage(page).map((chunk) => ({ ...chunk, embedding: [] })));
}
