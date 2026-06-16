import { describe, it, expect, vi } from "vitest";

// Mock both SDKs so the provider logic can be tested without network access.
vi.mock("openai", () => ({
  default: class {
    chat = {
      completions: {
        create: vi.fn(async () => ({ choices: [{ message: { content: " from openai " } }] })),
      },
    };
  },
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: vi.fn(async (args: { system?: string; messages: unknown[] }) => ({
        content: [
          { type: "text", text: `system=${args.system ?? ""};turns=${args.messages.length}` },
        ],
      })),
    };
  },
}));

import { AnthropicChatModel, OpenAiChatModel, createChatModel } from "../src/llm/provider";
import { loadConfig } from "../src/config";

describe("createChatModel", () => {
  it("returns null in extractive mode", () => {
    expect(createChatModel(loadConfig({}))).toBeNull();
  });

  it("returns null when the selected provider has no key", () => {
    expect(createChatModel(loadConfig({ LLM_PROVIDER: "openai" }))).toBeNull();
  });

  it("builds an OpenAI model when configured", () => {
    const model = createChatModel(loadConfig({ OPENAI_API_KEY: "sk" }));
    expect(model?.name).toContain("openai");
  });

  it("builds an Anthropic model when configured", () => {
    const model = createChatModel(
      loadConfig({ LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k" }),
    );
    expect(model?.name).toContain("anthropic");
  });
});

describe("OpenAiChatModel", () => {
  it("returns the trimmed completion text", async () => {
    const model = new OpenAiChatModel("sk");
    const answer = await model.complete([{ role: "user", content: "hi" }]);
    expect(answer).toBe("from openai");
  });
});

describe("AnthropicChatModel", () => {
  it("splits the system prompt from the conversation turns", async () => {
    const model = new AnthropicChatModel("k");
    const answer = await model.complete([
      { role: "system", content: "be brief" },
      { role: "user", content: "hi" },
    ]);
    // The mock echoes back how the messages were mapped.
    expect(answer).toBe("system=be brief;turns=1");
  });
});
