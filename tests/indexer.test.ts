import { describe, it, expect } from "vitest";
import { buildIndex } from "../src/embeddings/indexer";
import { VectorStore } from "../src/embeddings/store";
import { FakeEmbedder, makeCrawledPage, makeStoredChunk } from "./helpers";

describe("buildIndex", () => {
  it("chunks and embeds every page", async () => {
    const embedder = new FakeEmbedder((t) => [t.length, 0]);
    const pages = [makeCrawledPage({ id: "p", title: "P", markdown: "Hello world" })];
    const store = await buildIndex(pages, {}, { embedder });
    expect(store.size).toBe(1);
    expect(store.getAll()[0]?.embedding).toEqual([11, 0]);
    expect(embedder.embed).toHaveBeenCalledOnce();
  });

  it("reuses unchanged OpenAI embeddings and only embeds new text", async () => {
    const previous = new VectorStore({ mode: "openai", dimensions: 3, model: "fake" }, [
      makeStoredChunk({ pageId: "p", text: "Hello world", embedding: [1, 2, 3] }),
    ]);
    const embedder = new FakeEmbedder(() => [9, 9, 9], { mode: "openai", dimensions: 3 });
    const pages = [
      makeCrawledPage({ id: "p", title: "P", markdown: "Hello world" }),
      makeCrawledPage({ id: "q", title: "Q", markdown: "New text" }),
    ];

    const store = await buildIndex(pages, { openaiKey: "sk" }, { previous, embedder });

    const reused = store.getAll().find((c) => c.text === "Hello world");
    const fresh = store.getAll().find((c) => c.text === "New text");
    expect(reused?.embedding).toEqual([1, 2, 3]);
    expect(fresh?.embedding).toEqual([9, 9, 9]);
    expect(embedder.embed).toHaveBeenCalledOnce();
    expect(embedder.embed).toHaveBeenCalledWith(["New text"]);
  });
});
