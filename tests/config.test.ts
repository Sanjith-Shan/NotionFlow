import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config";

describe("loadConfig", () => {
  it("defaults to extractive mode with no keys", () => {
    const config = loadConfig({});
    expect(config.llmProvider).toBe("none");
    expect(config.indexPath).toBe("data/index.json");
    expect(config.port).toBe(3000);
  });

  it("selects OpenAI when its key is present", () => {
    const config = loadConfig({ OPENAI_API_KEY: "sk-test" });
    expect(config.llmProvider).toBe("openai");
    expect(config.openaiKey).toBe("sk-test");
  });

  it("honors an explicit provider", () => {
    const config = loadConfig({ LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k" });
    expect(config.llmProvider).toBe("anthropic");
  });

  it("reads index path and port overrides", () => {
    const config = loadConfig({ INDEX_PATH: "x/y.json", PORT: "4100" });
    expect(config.indexPath).toBe("x/y.json");
    expect(config.port).toBe(4100);
  });
});
