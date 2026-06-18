import { readFile } from "node:fs/promises";
import type { Config } from "./config";
import { NotionClient } from "./notion/client";
import { crawlWorkspace } from "./notion/crawler";
import type { CrawledPage, WorkspaceSnapshot } from "./notion/types";

export const FIXTURE_PATH = "fixtures/sample-workspace.json";

// Load the bundled sample workspace. This lets the whole project run with no
// Notion token, which means a reviewer can clone and see it work immediately.
export async function loadFixtureSnapshot(path: string = FIXTURE_PATH): Promise<WorkspaceSnapshot> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as WorkspaceSnapshot;
}

export interface SnapshotResult {
  snapshot: WorkspaceSnapshot;
  source: "live" | "fixture";
}

export interface GetSnapshotOptions {
  previous?: CrawledPage[];
  onProgress?: (done: number, total: number, title: string) => void;
}

// Crawl the live workspace when a token is configured, otherwise return the
// sample workspace.
export async function getSnapshot(
  config: Config,
  options: GetSnapshotOptions = {},
): Promise<SnapshotResult> {
  if (config.notionToken) {
    const client = NotionClient.fromToken(config.notionToken);
    const snapshot = await crawlWorkspace(client, {
      previous: options.previous,
      onProgress: options.onProgress,
    });
    return { snapshot, source: "live" };
  }
  return { snapshot: await loadFixtureSnapshot(), source: "fixture" };
}
