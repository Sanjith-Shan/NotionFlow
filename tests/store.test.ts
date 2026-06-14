import { describe, it, expect } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { cosineSimilarity, VectorStore } from "../src/embeddings/store";
import type { EmbedderMeta } from "../src/embeddings/embedder";
import { makeStoredChunk } from "./helpers";

const meta: EmbedderMeta = { mode: "tfidf", dimensions: 2, tfidf: { vocab: {}, idf: [1, 1] } };

describe("cosineSimilarity", () => {
  it("returns 1 for identical direction and 0 for orthogonal", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([1, 1], [1, 0])).toBeCloseTo(Math.SQRT1_2);
  });

  it("returns 0 when a vector has no magnitude", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe("VectorStore", () => {
  function seeded(): VectorStore {
    return new VectorStore(meta, [
      makeStoredChunk({ id: "a#0", pageId: "a", embedding: [1, 0] }),
      makeStoredChunk({ id: "b#0", pageId: "b", embedding: [0, 1] }),
      makeStoredChunk({ id: "a#1", pageId: "a", embedding: [0.9, 0.1] }),
    ]);
  }

  it("ranks results by cosine similarity", () => {
    const results = seeded().search([1, 0], { k: 2 });
    expect(results[0]?.chunk.id).toBe("a#0");
    expect(results[1]?.chunk.id).toBe("a#1");
    expect(results[0]?.score).toBeGreaterThan(results[1]?.score ?? 1);
  });

  it("limits results per page when asked", () => {
    const results = seeded().search([1, 0], { k: 5, maxPerPage: 1 });
    const pages = results.map((r) => r.chunk.pageId);
    expect(new Set(pages).size).toBe(pages.length);
  });

  it("reports size and page count", () => {
    const store = seeded();
    expect(store.size).toBe(3);
    expect(store.pageCount).toBe(2);
  });

  it("removes and upserts chunks by page", () => {
    const store = seeded();
    store.removeByPage("a");
    expect(store.size).toBe(1);
    store.upsertPage("b", [makeStoredChunk({ id: "b#0", pageId: "b", embedding: [0, 1] })]);
    expect(store.size).toBe(1);
    expect(store.hasPage("b")).toBe(true);
  });

  it("round trips through JSON", async () => {
    const store = seeded();
    const restored = VectorStore.fromJSON(store.toJSON());
    expect(restored.size).toBe(3);
    expect(restored.embedder.mode).toBe("tfidf");
  });

  it("saves to and loads from disk", async () => {
    const path = join(tmpdir(), `notionflow-index-${Date.now()}.json`);
    try {
      const store = seeded();
      await store.save(path);
      const loaded = await VectorStore.load(path);
      expect(loaded.size).toBe(3);
      expect(loaded.stats().pages).toBe(2);
    } finally {
      await rm(path, { force: true });
    }
  });

  it("exposes stats", () => {
    const stats = seeded().stats();
    expect(stats.chunks).toBe(3);
    expect(stats.pages).toBe(2);
    expect(stats.dimensions).toBe(2);
    expect(stats.embedderMode).toBe("tfidf");
  });
});
