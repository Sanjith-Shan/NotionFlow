import { describe, it, expect, vi } from "vitest";
import { weeklyDigest } from "../src/agent/summarizer";
import type { ChatModel } from "../src/llm/provider";
import type { WorkspaceSnapshot } from "../src/notion/types";
import { makeCrawledPage } from "./helpers";

const now = () => new Date("2026-06-25T00:00:00.000Z");

const snapshot: WorkspaceSnapshot = {
  databases: [],
  pages: [
    makeCrawledPage({
      id: "r1",
      title: "Recent One",
      markdown: "Shipped Atlas.",
      parentTitle: "Projects",
      lastEdited: "2026-06-24T00:00:00.000Z",
    }),
    makeCrawledPage({
      id: "r2",
      title: "Recent Two",
      markdown: "Standup notes.",
      parentTitle: "Meetings",
      lastEdited: "2026-06-23T00:00:00.000Z",
    }),
    makeCrawledPage({
      id: "old",
      title: "Old One",
      markdown: "Ancient history.",
      parentTitle: "Projects",
      lastEdited: "2026-05-01T00:00:00.000Z",
    }),
  ],
};

describe("weeklyDigest", () => {
  it("includes only pages edited within the window and groups by parent", async () => {
    const digest = await weeklyDigest(snapshot, { model: null, now }, { days: 7 });
    expect(digest.pageCount).toBe(2);
    const titles = digest.groups.flatMap((g) => g.pages.map((p) => p.title));
    expect(titles).toContain("Recent One");
    expect(titles).toContain("Recent Two");
    expect(titles).not.toContain("Old One");
    expect(digest.groups.map((g) => g.title).sort()).toEqual(["Meetings", "Projects"]);
  });

  it("produces an extractive summary without a model", async () => {
    const digest = await weeklyDigest(snapshot, { model: null, now }, { days: 7 });
    const projects = digest.groups.find((g) => g.title === "Projects");
    expect(projects?.summary).toContain("Recent One");
  });

  it("uses the model when provided", async () => {
    const model: ChatModel = { name: "fake", complete: vi.fn(async () => "Two bullet summary") };
    const digest = await weeklyDigest(snapshot, { model, now }, { days: 7 });
    expect(digest.groups[0]?.summary).toBe("Two bullet summary");
    expect(model.complete).toHaveBeenCalled();
  });

  it("can scope to a single database", async () => {
    const scoped: WorkspaceSnapshot = {
      databases: [],
      pages: [
        makeCrawledPage({
          id: "a",
          databaseId: "db1",
          parentTitle: "One",
          lastEdited: "2026-06-24T00:00:00.000Z",
        }),
        makeCrawledPage({
          id: "b",
          databaseId: "db2",
          parentTitle: "Two",
          lastEdited: "2026-06-24T00:00:00.000Z",
        }),
      ],
    };
    const digest = await weeklyDigest(scoped, { model: null, now }, { days: 7, databaseId: "db1" });
    expect(digest.pageCount).toBe(1);
  });
});
