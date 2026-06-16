import { describe, it, expect, vi } from "vitest";
import {
  createPageFromPrompt,
  generatePageMarkdown,
  parseTitle,
  type PageCreator,
} from "../src/agent/creator";
import type { ChatModel } from "../src/llm/provider";

describe("parseTitle", () => {
  it("prefers the first level one heading", () => {
    expect(parseTitle("# Meeting Notes\n\n## Agenda")).toBe("Meeting Notes");
  });
  it("falls back to the first non empty line", () => {
    expect(parseTitle("Some plain text here")).toBe("Some plain text here");
  });
});

describe("generatePageMarkdown", () => {
  it("builds a template when no model is available", async () => {
    const result = await generatePageMarkdown("create a design review page", null);
    expect(result.markdown).toContain("## Overview");
    expect(result.markdown).toContain("create a design review page");
    expect(result.title.length).toBeGreaterThan(0);
  });

  it("uses the model when present", async () => {
    const model: ChatModel = { name: "fake", complete: vi.fn(async () => "# Generated\n\nBody.") };
    const result = await generatePageMarkdown("anything", model);
    expect(result.title).toBe("Generated");
    expect(result.markdown).toContain("Body.");
  });
});

describe("createPageFromPrompt", () => {
  it("creates a page when a creator and parent are supplied", async () => {
    const creator: PageCreator = {
      createPage: vi.fn(async () => ({ id: "new-id", url: "https://notion.so/newid" })),
    };
    const result = await createPageFromPrompt("notes", {
      model: null,
      creator,
      parentId: "parent",
    });
    expect(result.created).toBe(true);
    expect(result.url).toBe("https://notion.so/newid");
    expect(creator.createPage).toHaveBeenCalledOnce();
  });

  it("returns a draft when no parent is supplied", async () => {
    const result = await createPageFromPrompt("notes", { model: null });
    expect(result.created).toBe(false);
    expect(result.id).toBe("");
    expect(result.markdown.length).toBeGreaterThan(0);
  });
});
