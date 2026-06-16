import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { Config } from "../config";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// A chat model produces an answer string from a list of messages. When no model
// is configured the factory returns null and callers fall back to an extractive
// answer built directly from the retrieved context.
export interface ChatModel {
  readonly name: string;
  complete(messages: ChatMessage[]): Promise<string>;
}

export const OPENAI_CHAT_MODEL = "gpt-4o-mini";
export const ANTHROPIC_CHAT_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1024;

export class OpenAiChatModel implements ChatModel {
  readonly name: string;
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey: string, model: string = OPENAI_CHAT_MODEL) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
    this.name = `openai:${model}`;
  }

  async complete(messages: ChatMessage[]): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature: 0.2,
      max_tokens: MAX_TOKENS,
    });
    return response.choices[0]?.message?.content?.trim() ?? "";
  }
}

export class AnthropicChatModel implements ChatModel {
  readonly name: string;
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(apiKey: string, model: string = ANTHROPIC_CHAT_MODEL) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.name = `anthropic:${model}`;
  }

  async complete(messages: ChatMessage[]): Promise<string> {
    // Anthropic takes the system prompt as a separate field and only accepts
    // user and assistant turns in the messages array.
    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const turns = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: MAX_TOKENS,
      system: system || undefined,
      messages: turns,
    });

    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();
  }
}

// Build the configured chat model, or null for the extractive fallback.
export function createChatModel(config: Config): ChatModel | null {
  if (config.llmProvider === "openai" && config.openaiKey) {
    return new OpenAiChatModel(config.openaiKey);
  }
  if (config.llmProvider === "anthropic" && config.anthropicKey) {
    return new AnthropicChatModel(config.anthropicKey);
  }
  return null;
}
