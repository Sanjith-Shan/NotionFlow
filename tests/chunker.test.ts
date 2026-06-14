import { describe, it, expect } from "vitest";
import { chunkMarkdown, chunkPage, estimateTokens } from "../src/embeddings/chunker";
import { makeCrawledPage } from "./helpers";

const meta = {
  pageId: "p1",
  pageTitle: "My Page",
  url: "https://notion.so/p1",
  lastEdited: "2026-06-01T00:00:00.000Z",
};

describe("estimateTokens", () => {
  it("approximates four characters per token", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcdefgh")).toBe(2);
  });
});

describe("chunkMarkdown", () => {
  it("creates a chunk boundary at each heading", () => {
    const md = "## Alpha\nFirst body.\n\n## Beta\nSecond body.";
    const chunks = chunkMarkdown(md, meta);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.sectionHeading).toBe("Alpha");
    expect(chunks[1]?.sectionHeading).toBe("Beta");
  });

  it("prefixes each chunk with its section heading", () => {
    const chunks = chunkMarkdown("## Decisions\nWe shipped it.", meta);
    expect(chunks[0]?.text.startsWith("Decisions")).toBe(true);
    expect(chunks[0]?.text).toContain("We shipped it.");
  });

  it("treats text before the first heading as an intro keyed by the page title", () => {
    const chunks = chunkMarkdown("Intro paragraph.\n\n## Body\nMore.", meta);
    expect(chunks[0]?.sectionHeading).toBe("My Page");
    // The intro heading equals the title, so it is not duplicated into the text.
    expect(chunks[0]?.text).toBe("Intro paragraph.");
  });

  it("splits long sections on paragraph boundaries", () => {
    const para = (n: number) => `Paragraph number ${n} ${"word ".repeat(20)}`;
    const md = `## Big\n${para(1)}\n\n${para(2)}\n\n${para(3)}`;
    const chunks = chunkMarkdown(md, meta, { maxTokens: 30 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(estimateTokens(chunk.text)).toBeLessThanOrEqual(60);
    }
  });

  it("preserves and increments chunk metadata", () => {
    const chunks = chunkMarkdown("## A\nx\n\n## B\ny", meta);
    chunks.forEach((chunk, i) => {
      expect(chunk.pageId).toBe("p1");
      expect(chunk.pageTitle).toBe("My Page");
      expect(chunk.url).toBe("https://notion.so/p1");
      expect(chunk.lastEdited).toBe("2026-06-01T00:00:00.000Z");
      expect(chunk.chunkIndex).toBe(i);
      expect(chunk.id).toBe(`p1#${i}`);
    });
  });

  it("produces no empty chunks for whitespace only content", () => {
    expect(chunkMarkdown("   \n\n  ", meta)).toHaveLength(0);
  });
});

describe("chunkPage", () => {
  it("derives chunk metadata from the page", () => {
    const page = makeCrawledPage({ id: "abc", title: "Title", markdown: "Hello world." });
    const chunks = chunkPage(page);
    expect(chunks[0]?.pageId).toBe("abc");
    expect(chunks[0]?.pageTitle).toBe("Title");
  });
});
