import { existsSync } from "node:fs";
import type { Config } from "./config";
import { buildIndex } from "./embeddings/indexer";
import { createEmbedderFromMeta, type Embedder } from "./embeddings/embedder";
import { VectorStore } from "./embeddings/store";
import { createChatModel, type ChatModel } from "./llm/provider";
import { loadFixtureSnapshot } from "./snapshot";

export interface Runtime {
  store: VectorStore;
  embedder: Embedder;
  model: ChatModel | null;
  // Whether retrieval is backed by a saved index or an ephemeral index built
  // from the sample workspace on startup.
  source: "index" | "fixture";
}

// Assemble everything needed to answer questions. A saved index is preferred.
// When none exists we build an in memory index from the sample workspace so the
// app is useful the moment it starts.
export async function createRuntime(config: Config): Promise<Runtime> {
  const model = createChatModel(config);

  if (existsSync(config.indexPath)) {
    const store = await VectorStore.load(config.indexPath);
    const embedder = createEmbedderFromMeta(store.embedder, { openaiKey: config.openaiKey });
    return { store, embedder, model, source: "index" };
  }

  const snapshot = await loadFixtureSnapshot();
  const store = await buildIndex(snapshot.pages, { openaiKey: config.openaiKey });
  const embedder = createEmbedderFromMeta(store.embedder, { openaiKey: config.openaiKey });
  return { store, embedder, model, source: "fixture" };
}
