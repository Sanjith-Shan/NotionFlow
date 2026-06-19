import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import express from "express";
import open from "open";
import { loadConfig, type Config } from "../src/config";
import { createRuntime, type Runtime } from "../src/runtime";
import { getSnapshot } from "../src/snapshot";
import { answerQuestion } from "../src/agent/rag";
import { suggestTagsForDatabase } from "../src/agent/tagger";
import { weeklyDigest } from "../src/agent/summarizer";
import { createPageFromPrompt } from "../src/agent/creator";
import { createEmbedderForCorpus } from "../src/embeddings/embedder";
import { createChatModel } from "../src/llm/provider";
import { indexWorkspace } from "../src/index-job";
import { NotionClient } from "../src/notion/client";
import type { WorkspaceSnapshot } from "../src/notion/types";
import { type ApiServices, type StatsResponse, createApp, HttpError } from "./routes";

// Wire the API operations to the real pipeline. The runtime and snapshot are
// cached so the first request pays to build the index and later ones are fast.
export function buildServices(config: Config): ApiServices {
  let runtimePromise: Promise<Runtime> | null = null;
  let snapshotCache: WorkspaceSnapshot | null = null;

  const getRuntime = (): Promise<Runtime> => (runtimePromise ??= createRuntime(config));
  const getSnap = async (): Promise<WorkspaceSnapshot> =>
    (snapshotCache ??= (await getSnapshot(config)).snapshot);

  const toStats = (runtime: Runtime): StatsResponse => {
    const s = runtime.store.stats();
    return {
      pages: s.pages,
      chunks: s.chunks,
      embedderMode: s.embedderMode,
      dimensions: s.dimensions,
      createdAt: s.createdAt,
      source: runtime.source,
      provider: config.llmProvider,
    };
  };

  return {
    async stats() {
      return toStats(await getRuntime());
    },
    async search(query, maxResults) {
      const runtime = await getRuntime();
      return answerQuestion(query, runtime, { k: maxResults ?? 6, maxPerPage: 2 });
    },
    async databases() {
      return (await getSnap()).databases;
    },
    async tag(databaseId) {
      const snapshot = await getSnap();
      const embedder = createEmbedderForCorpus(
        snapshot.pages.map((p) => `${p.title}\n${p.markdown}`),
        { openaiKey: config.openaiKey },
      );
      return suggestTagsForDatabase(snapshot, databaseId, embedder);
    },
    async applyTags(pageId, tags) {
      if (!config.notionToken) {
        throw new HttpError(400, "Applying tags requires a NOTION_API_TOKEN.");
      }
      const client = NotionClient.fromToken(config.notionToken);
      await client.applyTags(pageId, tags);
      return { applied: true };
    },
    async digest(days) {
      const snapshot = await getSnap();
      return weeklyDigest(snapshot, { model: createChatModel(config) }, { days });
    },
    async create(prompt, parentId) {
      const creator =
        config.notionToken && parentId ? NotionClient.fromToken(config.notionToken) : undefined;
      return createPageFromPrompt(prompt, {
        model: createChatModel(config),
        creator,
        parentId,
        parentType: "page",
      });
    },
    async reindex() {
      await indexWorkspace(config);
      runtimePromise = createRuntime(config);
      snapshotCache = null;
      return toStats(await runtimePromise);
    },
  };
}

export interface RunningServer {
  close: () => void;
  port: number;
}

export async function startServer(config: Config = loadConfig()): Promise<RunningServer> {
  const services = buildServices(config);
  const app = createApp(services);

  const webDir = resolve("dist/web");
  const hasWeb = existsSync(webDir);
  if (hasWeb) {
    app.use(express.static(webDir));
    app.get("*", (_req, res) => res.sendFile(join(webDir, "index.html")));
  }

  return new Promise((resolveServer) => {
    const server = app.listen(config.port, () => {
      const url = `http://localhost:${config.port}`;
      console.log(`NotionFlow dashboard on ${url}`);
      if (!hasWeb) {
        console.log(
          "Web bundle not found. Run `npm run dev:web` for the live UI, or `npm run build:web` then restart this server.",
        );
      } else {
        open(url).catch(() => undefined);
      }
      resolveServer({ close: () => server.close(), port: config.port });
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
