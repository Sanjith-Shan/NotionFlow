import { describe, it, expect, vi } from "vitest";
import { Client } from "@notionhq/client";
import {
  NotionClient,
  Pacer,
  extractDatabaseId,
  extractPageProperties,
  extractTitle,
  isRetryable,
} from "../src/notion/client";

describe("Pacer", () => {
  it("spaces calls by the configured interval", async () => {
    const sleeps: number[] = [];
    const pacer = new Pacer({
      intervalMs: 350,
      now: () => 1000,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    await pacer.wait();
    await pacer.wait();
    await pacer.wait();
    expect(sleeps).toEqual([350, 700]);
  });
});

describe("isRetryable", () => {
  it("retries on rate limits and server errors only", () => {
    expect(isRetryable({ status: 429 })).toBe(true);
    expect(isRetryable({ status: 503 })).toBe(true);
    expect(isRetryable({ code: "rate_limited" })).toBe(true);
    expect(isRetryable({ status: 400 })).toBe(false);
    expect(isRetryable(undefined)).toBe(false);
  });
});

const rawPage = {
  id: "p1",
  url: "https://notion.so/p1",
  last_edited_time: "2026-06-01T00:00:00.000Z",
  parent: { type: "data_source_id", data_source_id: "ds1" },
  properties: {
    Name: { type: "title", title: [{ plain_text: "Hello" }] },
    Tags: { type: "multi_select", multi_select: [{ name: "a" }, { name: "b" }] },
    Status: { type: "status", status: { name: "Done" } },
  },
};

describe("extraction helpers", () => {
  it("reads the title", () => {
    expect(extractTitle(rawPage)).toBe("Hello");
    expect(extractTitle({ id: "x" })).toBe("Untitled");
  });
  it("maps tags and status", () => {
    const props = extractPageProperties(rawPage);
    expect(props.tags).toEqual(["a", "b"]);
    expect(props.status).toBe("Done");
  });
  it("resolves the database id from the parent", () => {
    expect(extractDatabaseId(rawPage)).toBe("ds1");
    expect(
      extractDatabaseId({ id: "x", parent: { type: "workspace", workspace: true } }),
    ).toBeNull();
  });
});

function fakeNotion(overrides: Record<string, unknown>): Client {
  return overrides as unknown as Client;
}

const fastDeps = {
  pacer: new Pacer({ intervalMs: 0, sleep: async () => undefined }),
  sleep: async () => undefined,
};

describe("NotionClient", () => {
  it("lists and flattens pages", async () => {
    const search = vi
      .fn()
      .mockResolvedValue({ results: [rawPage], has_more: false, next_cursor: null });
    const client = new NotionClient({ client: fakeNotion({ search }), ...fastDeps });
    const pages = await client.listAllPages();
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({
      id: "p1",
      title: "Hello",
      databaseId: "ds1",
      properties: { tags: ["a", "b"], status: "Done" },
    });
  });

  it("reads page markdown", async () => {
    const retrieveMarkdown = vi.fn().mockResolvedValue({ markdown: "hi there" });
    const client = new NotionClient({
      client: fakeNotion({ pages: { retrieveMarkdown } }),
      ...fastDeps,
    });
    expect(await client.getPageMarkdown("p1")).toBe("hi there");
  });

  it("retries on a rate limit and then succeeds", async () => {
    const search = vi
      .fn()
      .mockRejectedValueOnce({ status: 429 })
      .mockResolvedValue({ results: [], has_more: false, next_cursor: null });
    const client = new NotionClient({ client: fakeNotion({ search }), ...fastDeps });
    const pages = await client.listAllPages();
    expect(pages).toEqual([]);
    expect(search).toHaveBeenCalledTimes(2);
  });
});
