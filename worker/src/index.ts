import { Worker } from "@notionhq/workers";
import { j } from "@notionhq/workers/schema-builder";
import { Retriever, type CorpusPage } from "./lib/retriever";
import { generateAnswer, summarizeGroup } from "./lib/llm";
import corpusData from "./corpus.json";

// The Worker is the headline of NotionFlow. It registers three agent tools that
// Notion Custom Agents and external agents can call. Retrieval runs over a
// bundled snapshot of the workspace built by `npm run build:worker-corpus`. In a
// real deployment the corpus would be refreshed by a sync, and the context
// client (context.notion) lets tools read live pages on demand.

const corpus = corpusData as CorpusPage[];
const retriever = new Retriever(corpus);

const worker = new Worker();
export default worker;

// Compute the digest window relative to the most recent edit in the corpus, so
// the demo returns activity no matter when it is run.
function referenceDate(): Date {
  const times = corpus.map((p) => new Date(p.lastEdited).getTime()).filter((t) => !Number.isNaN(t));
  const latest = times.length > 0 ? Math.max(...times) : Date.now();
  return new Date(latest);
}

// Tool 1. RAG powered semantic search across the workspace.
worker.tool<
  { query: string; maxResults: number | null },
  {
    answer: string;
    sources: Array<{ title: string; url: string; score: number }>;
  }
>("searchWorkspace", {
  title: "Search Workspace Knowledge",
  description:
    "Search across indexed workspace pages using semantic similarity to answer a question. " +
    "Returns a synthesized answer with source page links.",
  schema: j.object({
    query: j.string().describe("The question or search query."),
    maxResults: j.number().describe("Maximum pages to retrieve. Defaults to 5.").nullable(),
  }),
  outputSchema: j.object({
    answer: j.string(),
    sources: j.array(j.object({ title: j.string(), url: j.string(), score: j.number() })),
  }),
  hints: { readOnlyHint: true },
  execute: async ({ query, maxResults }) => {
    const hits = retriever.search(query, maxResults ?? 5).filter((h) => h.score > 0);
    const answer = await generateAnswer(
      query,
      hits.map((h) => h.page),
    );
    return {
      answer,
      sources: hits.map((h) => ({
        title: h.page.title,
        url: h.page.url,
        score: Math.round(h.score * 1000) / 1000,
      })),
    };
  },
});

// Tool 2. Suggest tags for a page based on similar already tagged pages.
worker.tool<{ pageId: string }, { suggestions: Array<{ tag: string; confidence: number }> }>(
  "suggestTags",
  {
    title: "Suggest Tags for Page",
    description:
      "Analyze a page's content and suggest tags based on similarity to already tagged pages " +
      "in the workspace. Returns tags with confidence scores.",
    schema: j.object({
      pageId: j.string().describe("The Notion page id to analyze."),
    }),
    outputSchema: j.object({
      suggestions: j.array(j.object({ tag: j.string(), confidence: j.number() })),
    }),
    hints: { readOnlyHint: true },
    execute: async ({ pageId }, { notion }) => {
      const known = retriever.pages.find((p) => p.id === pageId);
      let vector: number[];
      if (known) {
        vector = retriever.embed(`${known.title}\n${known.markdown}`);
      } else {
        // Fall back to reading the live page through the context client.
        try {
          const page = await notion.pages.retrieveMarkdown({ page_id: pageId });
          vector = retriever.embed((page as { markdown?: string }).markdown ?? "");
        } catch {
          return { suggestions: [] };
        }
      }

      const neighbors = retriever
        .similarTo(vector, 8, pageId)
        .filter((r) => r.page.tags.length > 0)
        .slice(0, 5);
      if (neighbors.length === 0) return { suggestions: [] };

      const votes = new Map<string, number>();
      for (const n of neighbors) {
        for (const tag of new Set(n.page.tags)) votes.set(tag, (votes.get(tag) ?? 0) + 1);
      }
      const suggestions = [...votes.entries()]
        .filter(([, count]) => count >= 2)
        .map(([tag, count]) => ({
          tag,
          confidence: Math.round((count / neighbors.length) * 100) / 100,
        }))
        .sort((a, b) => b.confidence - a.confidence);
      return { suggestions };
    },
  },
);

// Tool 3. Summarize recent workspace activity into a structured digest.
worker.tool<
  { databaseId: string | null },
  {
    since: string;
    pageCount: number;
    groups: Array<{ title: string; summary: string; pages: Array<{ title: string; url: string }> }>;
  }
>("weeklyDigest", {
  title: "Generate Weekly Digest",
  description:
    "Summarize workspace activity from the past 7 days into a structured digest with key updates, " +
    "grouped by parent. Optionally scope to a single database.",
  schema: j.object({
    databaseId: j.string().describe("Optionally scope to a specific database id.").nullable(),
  }),
  outputSchema: j.object({
    since: j.string(),
    pageCount: j.number(),
    groups: j.array(
      j.object({
        title: j.string(),
        summary: j.string(),
        pages: j.array(j.object({ title: j.string(), url: j.string() })),
      }),
    ),
  }),
  hints: { readOnlyHint: true },
  execute: async ({ databaseId }) => {
    const cutoff = new Date(referenceDate().getTime() - 7 * 24 * 60 * 60 * 1000);
    const recent = retriever.pages
      .filter((p) => !databaseId || p.databaseId === databaseId)
      .filter((p) => new Date(p.lastEdited) >= cutoff)
      .sort((a, b) => new Date(b.lastEdited).getTime() - new Date(a.lastEdited).getTime());

    const grouped = new Map<string, CorpusPage[]>();
    for (const page of recent) {
      const key = page.parentTitle ?? "Workspace";
      const list = grouped.get(key) ?? [];
      list.push(page);
      grouped.set(key, list);
    }

    const groups = await Promise.all(
      [...grouped.entries()].map(async ([title, pages]) => ({
        title,
        summary: await summarizeGroup(title, pages),
        pages: pages.map((p) => ({ title: p.title, url: p.url })),
      })),
    );

    return { since: cutoff.toISOString(), pageCount: recent.length, groups };
  },
});
