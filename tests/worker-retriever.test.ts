import { describe, it, expect, afterEach } from "vitest";
import { Retriever, cosine, type CorpusPage } from "../worker/src/lib/retriever";
import { generateAnswer } from "../worker/src/lib/llm";

const corpus: CorpusPage[] = [
  {
    id: "1",
    title: "Postgres",
    url: "https://notion.so/1",
    markdown: "We use postgres for relational joins between events and customers.",
    tags: ["backend"],
    lastEdited: "2026-06-01T00:00:00.000Z",
    databaseId: "db",
  },
  {
    id: "2",
    title: "Design System",
    url: "https://notion.so/2",
    markdown: "Our color palette and typography choices for the dashboard.",
    tags: ["design"],
    lastEdited: "2026-06-02T00:00:00.000Z",
    databaseId: "db",
  },
];

describe("Retriever", () => {
  it("ranks the most relevant page first", () => {
    const retriever = new Retriever(corpus);
    const results = retriever.search("postgres relational joins", 1);
    expect(results[0]?.page.id).toBe("1");
  });

  it("finds similar pages and can exclude one", () => {
    const retriever = new Retriever(corpus);
    const vector = retriever.embed("color palette typography");
    const results = retriever.similarTo(vector, 2, "2");
    expect(results.every((r) => r.page.id !== "2")).toBe(true);
  });

  it("produces normalized vectors", () => {
    const retriever = new Retriever(corpus);
    const v = retriever.embed("postgres");
    expect(cosine(v, v)).toBeCloseTo(1);
  });
});

describe("generateAnswer", () => {
  const original = process.env.OPENAI_API_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = original;
  });

  it("falls back to an extractive answer with no key", async () => {
    delete process.env.OPENAI_API_KEY;
    const answer = await generateAnswer("what database do we use", [corpus[0]!]);
    expect(answer).toContain("Postgres");
  });
});
