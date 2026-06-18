import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config";
import { createRuntime } from "../src/runtime";
import { loadFixtureSnapshot } from "../src/snapshot";

describe("loadFixtureSnapshot", () => {
  it("loads the bundled sample workspace", async () => {
    const snapshot = await loadFixtureSnapshot();
    expect(snapshot.pages.length).toBeGreaterThan(0);
    expect(snapshot.databases.length).toBeGreaterThan(0);
  });
});

describe("createRuntime", () => {
  it("builds an ephemeral index from the sample workspace when no index file exists", async () => {
    const config = { ...loadConfig({}), indexPath: "data/this-does-not-exist.json" };
    const runtime = await createRuntime(config);
    expect(runtime.source).toBe("fixture");
    expect(runtime.store.size).toBeGreaterThan(0);
    expect(runtime.embedder.mode).toBe("tfidf");
    expect(runtime.model).toBeNull();
  });
});
