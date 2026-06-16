import type { Embedder } from "../embeddings/embedder";
import type { SearchResult, VectorStore } from "../embeddings/store";
import type { ChatMessage, ChatModel } from "../llm/provider";

export interface Source {
  pageId: string;
  pageTitle: string;
  pageUrl: string;
  relevanceScore: number;
  snippet: string;
}

export interface RagAnswer {
  answer: string;
  sources: Source[];
  usedModel: string;
}

export interface RagDeps {
  store: VectorStore;
  embedder: Embedder;
  model: ChatModel | null;
}

export interface AnswerOptions {
  k?: number;
  maxPerPage?: number;
  minScore?: number;
}

export const RAG_SYSTEM_PROMPT =
  "You are a helpful assistant answering questions about a Notion workspace. " +
  "Use ONLY the provided context to answer. If the context does not contain enough " +
  "information, say so plainly. Always cite which pages your answer comes from.";

const SNIPPET_LENGTH = 220;

function snippetOf(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > SNIPPET_LENGTH ? `${clean.slice(0, SNIPPET_LENGTH)}...` : clean;
}

// Reduce chunk level results to one source per page, keeping the best score.
export function dedupeSources(results: SearchResult[]): Source[] {
  const byPage = new Map<string, Source>();
  for (const { chunk, score } of results) {
    const existing = byPage.get(chunk.pageId);
    if (existing && existing.relevanceScore >= score) continue;
    byPage.set(chunk.pageId, {
      pageId: chunk.pageId,
      pageTitle: chunk.pageTitle,
      pageUrl: chunk.url,
      relevanceScore: Math.round(score * 1000) / 1000,
      snippet: snippetOf(chunk.text),
    });
  }
  return [...byPage.values()].sort((a, b) => b.relevanceScore - a.relevanceScore);
}

function buildContext(results: SearchResult[]): string {
  return results
    .map((r, i) => `[${i + 1}] Page "${r.chunk.pageTitle}"\n${r.chunk.text}`)
    .join("\n\n---\n\n");
}

// Build an answer without any language model by stitching the most relevant
// snippets together. Keeps the zero key demo useful.
export function extractiveAnswer(question: string, results: SearchResult[]): string {
  const top = results.slice(0, 3);
  const lines = top.map((r) => `From "${r.chunk.pageTitle}". ${snippetOf(r.chunk.text)}`);
  return [
    `Here is what the workspace says about "${question}".`,
    "",
    ...lines.map((l) => `- ${l}`),
    "",
    "This answer was assembled from the most relevant pages without a language model. Add an API key for a synthesized answer.",
  ].join("\n");
}

// The core retrieval augmented generation entry point. Embeds the question,
// retrieves the most similar chunks, then either asks the model or falls back
// to an extractive answer.
export async function answerQuestion(
  question: string,
  deps: RagDeps,
  options: AnswerOptions = {},
): Promise<RagAnswer> {
  const k = options.k ?? 5;
  const maxPerPage = options.maxPerPage ?? 2;
  const minScore = options.minScore ?? 0;

  const [queryEmbedding] = await deps.embedder.embed([question]);
  const results = deps.store
    .search(queryEmbedding ?? [], { k, maxPerPage })
    .filter((r) => r.score > minScore);

  if (results.length === 0) {
    return {
      answer: "I could not find anything about that in the indexed workspace.",
      sources: [],
      usedModel: deps.model?.name ?? "extractive",
    };
  }

  const sources = dedupeSources(results);

  if (!deps.model) {
    return { answer: extractiveAnswer(question, results), sources, usedModel: "extractive" };
  }

  const messages: ChatMessage[] = [
    { role: "system", content: RAG_SYSTEM_PROMPT },
    {
      role: "user",
      content: `Context from the workspace:\n\n${buildContext(results)}\n\nQuestion: ${question}`,
    },
  ];
  const answer = await deps.model.complete(messages);
  return { answer, sources, usedModel: deps.model.name };
}
