import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp, HttpError, type ApiServices, type StatsResponse } from "../server/routes";

const stats: StatsResponse = {
  pages: 1,
  chunks: 2,
  embedderMode: "tfidf",
  dimensions: 2,
  createdAt: "2026-06-01T00:00:00.000Z",
  source: "fixture",
  provider: "none",
};

function services(over: Partial<ApiServices> = {}): ApiServices {
  return {
    stats: async () => stats,
    search: async (query) => ({ answer: `A:${query}`, sources: [], usedModel: "extractive" }),
    databases: async () => [{ id: "db", title: "DB", dataSourceId: "ds", tagOptions: [] }],
    tag: async () => [],
    applyTags: async () => ({ applied: true }),
    digest: async () => ({ since: "2026-06-01T00:00:00.000Z", pageCount: 0, groups: [] }),
    create: async (prompt) => ({ title: "T", markdown: prompt, id: "", url: "", created: false }),
    reindex: async () => stats,
    ...over,
  };
}

describe("API routes", () => {
  it("returns stats", async () => {
    const res = await request(createApp(services())).get("/api/stats");
    expect(res.status).toBe(200);
    expect(res.body.pages).toBe(1);
  });

  it("searches with a query", async () => {
    const res = await request(createApp(services())).post("/api/search").send({ query: "hi" });
    expect(res.status).toBe(200);
    expect(res.body.answer).toBe("A:hi");
  });

  it("rejects a search with no query", async () => {
    const res = await request(createApp(services())).post("/api/search").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/query/);
  });

  it("lists databases", async () => {
    const res = await request(createApp(services())).get("/api/databases");
    expect(res.status).toBe(200);
    expect(res.body[0].title).toBe("DB");
  });

  it("applies tags", async () => {
    const res = await request(createApp(services()))
      .post("/api/tag/apply")
      .send({ pageId: "p", tags: ["a"] });
    expect(res.status).toBe(200);
    expect(res.body.applied).toBe(true);
  });

  it("creates a page", async () => {
    const res = await request(createApp(services())).post("/api/create").send({ prompt: "notes" });
    expect(res.status).toBe(200);
    expect(res.body.markdown).toBe("notes");
  });

  it("maps HttpError to its status", async () => {
    const app = createApp(
      services({
        applyTags: async () => {
          throw new HttpError(400, "needs token");
        },
      }),
    );
    const res = await request(app).post("/api/tag/apply").send({ pageId: "p", tags: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("needs token");
  });

  it("maps unexpected errors to 500", async () => {
    const app = createApp(
      services({
        search: async () => {
          throw new Error("boom");
        },
      }),
    );
    const res = await request(app).post("/api/search").send({ query: "x" });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("boom");
  });
});
