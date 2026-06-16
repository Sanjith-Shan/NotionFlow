import { describe, it, expect, vi } from "vitest";
import { answerQuestion, dedupeSources } from "../src/agent/rag";
import { VectorStore } from "../src/embeddings/store";
import type { EmbedderMeta } from "../src/embeddings/embedder";
import type { ChatModel } from "../src/llm/provider";
import { FakeEmbedder, makeStoredChunk } from "./helpers";

const meta: EmbedderMeta = { mode: "tfidf", dimensions: 2, tfidf: { vocab: {}, idf: [1, 1] } };

function storeWith(): VectorStore {
  return new VectorStore(meta, [
    makeStoredChunk({
      id: "a#0",
      pageId: "a",
      pageTitle: "Alpha",
      text: "alpha one",
      embedding: [1, 0],
    }),
    makeStoredChunk({
      id: "a#1",
      pageId: "a",
      pageTitle: "Alpha",
      text: "alpha two",
      embedding: [0.9, 0.1],
    }),
    makeStoredChunk({ id: "b#0", pageId: "b", pageTitle: "Beta", text: "beta", embedding: [0, 1] }),
  ]);
}

const relevantEmbedder = new FakeEmbedder(() => [1, 0]);
const orthogonalEmbedder = new FakeEmbedder(() => [0, 0]);

describe("dedupeSources", () => {
  it("keeps one source per page with the best score", () => {
    const results = [
      { chunk: makeStoredChunk({ pageId: "a", pageTitle: "Alpha", embedding: [] }), score: 0.4 },
      { chunk: makeStoredChunk({ pageId: "a", pageTitle: "Alpha", embedding: [] }), score: 0.9 },
      { chunk: makeStoredChunk({ pageId: "b", pageTitle: "Beta", embedding: [] }), score: 0.5 },
    ];
    const sources = dedupeSources(results);
    expect(sources).toHaveLength(2);
    expect(sources[0]?.pageTitle).toBe("Alpha");
    expect(sources[0]?.relevanceScore).toBe(0.9);
  });
});

describe("answerQuestion", () => {
  it("returns an extractive answer when no model is configured", async () => {
    const result = await answerQuestion("what is alpha", {
      store: storeWith(),
      embedder: relevantEmbedder,
      model: null,
    });
    expect(result.usedModel).toBe("extractive");
    expect(result.answer.toLowerCase()).toContain("workspace says");
    expect(result.sources.length).toBeGreaterThan(0);
    // Sources are deduped to one per page.
    expect(new Set(result.sources.map((s) => s.pageId)).size).toBe(result.sources.length);
  });

  it("asks the model when one is configured", async () => {
    const model: ChatModel = { name: "fake", complete: vi.fn(async () => "SYNTHESIZED") };
    const result = await answerQuestion("q", {
      store: storeWith(),
      embedder: relevantEmbedder,
      model,
    });
    expect(result.answer).toBe("SYNTHESIZED");
    expect(result.usedModel).toBe("fake");
    const messages = vi.mocked(model.complete).mock.calls[0]?.[0] ?? [];
    expect(messages[0]?.role).toBe("system");
    expect(messages[1]?.content).toContain("Question: q");
  });

  it("reports when nothing relevant is found", async () => {
    const result = await answerQuestion("q", {
      store: storeWith(),
      embedder: orthogonalEmbedder,
      model: null,
    });
    expect(result.answer).toMatch(/could not find/i);
    expect(result.sources).toHaveLength(0);
  });
});
