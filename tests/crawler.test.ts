import { describe, it, expect, vi } from "vitest";
import { crawlWorkspace } from "../src/notion/crawler";
import type { CrawlSource } from "../src/notion/client";
import type { PageSummary } from "../src/notion/types";

function summary(id: string, lastEdited: string): PageSummary {
  return {
    id,
    title: `Title ${id}`,
    url: `https://notion.so/${id}`,
    lastEdited,
    parentId: null,
    parentTitle: null,
    databaseId: null,
    properties: { tags: [] },
  };
}

function source(over: Partial<CrawlSource> = {}): CrawlSource {
  return {
    listAllPages: vi.fn(async () => [
      summary("a", "2026-06-01T00:00:00.000Z"),
      summary("b", "2026-06-02T00:00:00.000Z"),
    ]),
    getPageMarkdown: vi.fn(async (id: string) => `md:${id}`),
    listDatabases: vi.fn(async () => []),
    ...over,
  };
}

describe("crawlWorkspace", () => {
  it("fetches markdown for each page and reports progress", async () => {
    const progress = vi.fn();
    const snapshot = await crawlWorkspace(source(), { onProgress: progress });
    expect(snapshot.pages).toHaveLength(2);
    expect(snapshot.pages[0]?.markdown).toBe("md:a");
    expect(progress).toHaveBeenCalledTimes(2);
  });

  it("reuses cached markdown for unchanged pages", async () => {
    const getPageMarkdown = vi.fn(async (id: string) => `fresh:${id}`);
    const previous = [
      { ...summary("a", "2026-06-01T00:00:00.000Z"), markdown: "cached:a" },
      { ...summary("b", "2026-06-01T00:00:00.000Z"), markdown: "stale:b" },
    ];
    const snapshot = await crawlWorkspace(source({ getPageMarkdown }), { previous });

    const a = snapshot.pages.find((p) => p.id === "a");
    const b = snapshot.pages.find((p) => p.id === "b");
    expect(a?.markdown).toBe("cached:a"); // unchanged lastEdited, reused
    expect(b?.markdown).toBe("fresh:b"); // lastEdited changed, refetched
    expect(getPageMarkdown).toHaveBeenCalledTimes(1);
    expect(getPageMarkdown).toHaveBeenCalledWith("b");
  });
});
