import "dotenv/config";

// Which service generates natural language answers. The retriever works without
// any of these. "none" produces an extractive answer stitched from the most
// relevant chunks so the project runs with zero API keys.
export type LlmProvider = "openai" | "anthropic" | "none";

export interface Config {
  notionToken?: string;
  openaiKey?: string;
  anthropicKey?: string;
  llmProvider: LlmProvider;
  indexPath: string;
  port: number;
}

function pick(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

// Resolve the answer provider. An explicit LLM_PROVIDER wins. Otherwise we use
// OpenAI when its key is present and fall back to the extractive mode.
function resolveProvider(env: NodeJS.ProcessEnv, openaiKey?: string): LlmProvider {
  const explicit = pick(env.LLM_PROVIDER)?.toLowerCase();
  if (explicit === "openai" || explicit === "anthropic" || explicit === "none") {
    return explicit;
  }
  if (openaiKey) return "openai";
  return "none";
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const openaiKey = pick(env.OPENAI_API_KEY);
  const anthropicKey = pick(env.ANTHROPIC_API_KEY);
  return {
    notionToken: pick(env.NOTION_API_TOKEN),
    openaiKey,
    anthropicKey,
    llmProvider: resolveProvider(env, openaiKey),
    indexPath: pick(env.INDEX_PATH) ?? "data/index.json",
    port: Number(pick(env.PORT) ?? "3000"),
  };
}
