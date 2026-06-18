import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Config } from "./config";
import { buildIndex } from "./embeddings/indexer";
import { VectorStore } from "./embeddings/store";
import type { WorkspaceSnapshot } from "./notion/types";
import { getSnapshot } from "./snapshot";

export function snapshotPathFor(indexPath: string): string {
  return join(dirname(indexPath), "snapshot.json");
}

export interface IndexResult {
  store: VectorStore;
  source: "live" | "fixture";
  pages: number;
  chunks: number;
  snapshotPath: string;
  indexPath: string;
}

export type ProgressFn = (done: number, total: number, title: string) => void;

// Crawl the workspace, build the vector index, and persist both the index and a
// snapshot of the crawl. The snapshot enables incremental re crawling, and a
// previous index lets unchanged OpenAI embeddings be reused.
export async function indexWorkspace(
  config: Config,
  onProgress?: ProgressFn,
): Promise<IndexResult> {
  const snapshotPath = snapshotPathFor(config.indexPath);

  let previousPages: WorkspaceSnapshot["pages"] | undefined;
  if (existsSync(snapshotPath)) {
    const prev = JSON.parse(await readFile(snapshotPath, "utf8")) as WorkspaceSnapshot;
    previousPages = prev.pages;
  }

  const { snapshot, source } = await getSnapshot(config, {
    previous: previousPages,
    onProgress,
  });

  const previousStore = existsSync(config.indexPath)
    ? await VectorStore.load(config.indexPath)
    : undefined;

  const store = await buildIndex(
    snapshot.pages,
    { openaiKey: config.openaiKey },
    { previous: previousStore },
  );

  await store.save(config.indexPath);
  await mkdir(dirname(snapshotPath), { recursive: true });
  await writeFile(snapshotPath, JSON.stringify(snapshot), "utf8");

  return {
    store,
    source,
    pages: snapshot.pages.length,
    chunks: store.size,
    snapshotPath,
    indexPath: config.indexPath,
  };
}
