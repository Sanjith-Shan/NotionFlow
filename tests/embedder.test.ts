import { describe, it, expect } from "vitest";
import {
  TfidfEmbedder,
  createEmbedderForCorpus,
  createEmbedderFromMeta,
  tokenize,
} from "../src/embeddings/embedder";
import { cosineSimilarity } from "../src/embeddings/store";

describe("tokenize", () => {
  it("lowercases, drops stopwords and single characters", () => {
    expect(tokenize("The Quick a Fox")).toEqual(["quick", "fox"]);
  });
});

describe("TfidfEmbedder", () => {
  const corpus = ["the cat sat on the mat", "the dog ran in the park", "cats and dogs are pets"];

  it("embeds queries into the corpus vocabulary", async () => {
    const embedder = TfidfEmbedder.fit(corpus);
    const [vec] = await embedder.embed(["cat"]);
    expect(vec?.length).toBe(embedder.dimensions);
    expect(vec?.some((v) => v > 0)).toBe(true);
  });

  it("ranks a relevant document above an irrelevant one", async () => {
    const embedder = TfidfEmbedder.fit(corpus);
    const [query, cat, dog] = await embedder.embed([
      "cat",
      "the cat sat on the mat",
      "the dog ran in the park",
    ]);
    expect(cosineSimilarity(query ?? [], cat ?? [])).toBeGreaterThan(
      cosineSimilarity(query ?? [], dog ?? []),
    );
  });

  it("restores from metadata and embeds identically", async () => {
    const embedder = TfidfEmbedder.fit(corpus);
    const meta = embedder.meta();
    if (meta.mode !== "tfidf") throw new Error("expected tfidf meta");
    const restored = new TfidfEmbedder(meta.tfidf);
    const [a] = await embedder.embed(["cat"]);
    const [b] = await restored.embed(["cat"]);
    expect(b).toEqual(a);
  });

  it("returns a zero vector for out of vocabulary text", async () => {
    const embedder = TfidfEmbedder.fit(corpus);
    const [vec] = await embedder.embed(["zzz xyzzy"]);
    expect(vec?.every((v) => v === 0)).toBe(true);
  });
});

describe("createEmbedderForCorpus", () => {
  it("falls back to TF-IDF when no OpenAI key is present", () => {
    const embedder = createEmbedderForCorpus(["hello world"], {});
    expect(embedder.mode).toBe("tfidf");
  });

  it("respects forceTfidf even with a key", () => {
    const embedder = createEmbedderForCorpus(["hello world"], {
      openaiKey: "sk-test",
      forceTfidf: true,
    });
    expect(embedder.mode).toBe("tfidf");
  });
});

describe("createEmbedderFromMeta", () => {
  it("rebuilds a TF-IDF embedder from metadata", () => {
    const meta = TfidfEmbedder.fit(["alpha beta"]).meta();
    const embedder = createEmbedderFromMeta(meta, {});
    expect(embedder.mode).toBe("tfidf");
  });

  it("throws for an OpenAI index when no key is available", () => {
    const meta = { mode: "openai", dimensions: 1536, model: "text-embedding-3-small" } as const;
    expect(() => createEmbedderFromMeta(meta, {})).toThrow(/OPENAI_API_KEY/);
  });
});
