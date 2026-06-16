import { describe, it, expect } from "vitest";
import { suggestTags, suggestTagsForDatabase, type TaggablePage } from "../src/agent/tagger";
import type { WorkspaceSnapshot } from "../src/notion/types";
import { FakeEmbedder, makeCrawledPage } from "./helpers";

describe("suggestTags", () => {
  const tagged: TaggablePage[] = [
    { pageId: "1", pageTitle: "A", pageUrl: "u", tags: ["backend", "api"], embedding: [0.9, 0.1] },
    { pageId: "2", pageTitle: "B", pageUrl: "u", tags: ["backend", "data"], embedding: [0.8, 0.2] },
    { pageId: "3", pageTitle: "C", pageUrl: "u", tags: ["design"], embedding: [0, 1] },
  ];

  it("suggests tags shared by the most similar pages", () => {
    const target: TaggablePage = {
      pageId: "t",
      pageTitle: "T",
      pageUrl: "u",
      tags: [],
      embedding: [1, 0],
    };
    const suggestions = suggestTags(target, tagged, { minVotes: 2 });
    expect(suggestions[0]?.tag).toBe("backend");
    expect(suggestions[0]?.confidence).toBeGreaterThan(0.5);
    expect(suggestions.map((s) => s.tag)).not.toContain("design");
  });

  it("returns nothing when no tags clear the vote threshold", () => {
    const target: TaggablePage = {
      pageId: "t",
      pageTitle: "T",
      pageUrl: "u",
      tags: [],
      embedding: [1, 0],
    };
    const suggestions = suggestTags(target, tagged, { minVotes: 3 });
    expect(suggestions).toHaveLength(0);
  });

  it("ignores the target itself and untagged pages", () => {
    const onlyUntagged: TaggablePage[] = [
      { pageId: "x", pageTitle: "X", pageUrl: "u", tags: [], embedding: [1, 0] },
    ];
    expect(suggestTags(onlyUntagged[0]!, onlyUntagged)).toHaveLength(0);
  });
});

describe("suggestTagsForDatabase", () => {
  it("suggests tags for untagged pages using neighbor pages", async () => {
    const snapshot: WorkspaceSnapshot = {
      databases: [{ id: "db", title: "DB", dataSourceId: "ds", tagOptions: ["backend"] }],
      pages: [
        makeCrawledPage({
          id: "1",
          title: "Indexing",
          markdown: "postgres index query",
          databaseId: "db",
          properties: { tags: ["backend"] },
        }),
        makeCrawledPage({
          id: "2",
          title: "Queries",
          markdown: "postgres query plan",
          databaseId: "db",
          properties: { tags: ["backend"] },
        }),
        makeCrawledPage({
          id: "3",
          title: "Untagged",
          markdown: "postgres index speed",
          databaseId: "db",
          properties: { tags: [] },
        }),
        makeCrawledPage({
          id: "9",
          title: "Other DB",
          markdown: "design system",
          databaseId: "other",
          properties: { tags: ["design"] },
        }),
      ],
    };

    // Map each page text to a vector by topic so the untagged page is closest to
    // the two tagged backend pages.
    const embedder = new FakeEmbedder((text) => (text.includes("postgres") ? [1, 0] : [0, 1]));
    const results = await suggestTagsForDatabase(snapshot, "db", embedder, { minVotes: 2 });
    expect(results).toHaveLength(1);
    expect(results[0]?.pageId).toBe("3");
    expect(results[0]?.suggestions[0]?.tag).toBe("backend");
  });
});
