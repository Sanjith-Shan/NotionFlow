import type { ChatMessage, ChatModel } from "../llm/provider";
import type { CrawledPage, WorkspaceSnapshot } from "../notion/types";

export interface DigestPage {
  title: string;
  url: string;
  lastEdited: string;
}

export interface DigestGroup {
  title: string;
  summary: string;
  pages: DigestPage[];
}

export interface Digest {
  since: string;
  pageCount: number;
  groups: DigestGroup[];
}

export interface DigestDeps {
  model: ChatModel | null;
  now?: () => Date;
}

export interface DigestOptions {
  days?: number;
  databaseId?: string;
}

const DIGEST_SYSTEM_PROMPT =
  "You summarize recent activity in a Notion workspace. Given a set of recently " +
  "edited pages, write two or three short bullet points capturing the key updates. " +
  "Be concrete and factual. Do not invent details.";

function firstWords(markdown: string, count: number): string {
  return markdown
    .replace(/[#>*`_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, count)
    .join(" ");
}

function groupKey(page: CrawledPage): string {
  return page.parentTitle ?? (page.databaseId ? "Database" : "Workspace");
}

async function summarizeGroup(
  title: string,
  pages: CrawledPage[],
  model: ChatModel | null,
): Promise<string> {
  if (!model) {
    // Extractive fallback. List each page with its opening line.
    return pages.map((p) => `- ${p.title}. ${firstWords(p.markdown, 25)}.`).join("\n");
  }
  const body = pages.map((p) => `Page "${p.title}":\n${firstWords(p.markdown, 200)}`).join("\n\n");
  const messages: ChatMessage[] = [
    { role: "system", content: DIGEST_SYSTEM_PROMPT },
    { role: "user", content: `Section "${title}". Recently edited pages:\n\n${body}` },
  ];
  return model.complete(messages);
}

// Build a digest of pages edited within the last N days, grouped by their
// parent, with a short summary per group.
export async function weeklyDigest(
  snapshot: WorkspaceSnapshot,
  deps: DigestDeps,
  options: DigestOptions = {},
): Promise<Digest> {
  const days = options.days ?? 7;
  const now = (deps.now ?? (() => new Date()))();
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const recent = snapshot.pages
    .filter((p) => !options.databaseId || p.databaseId === options.databaseId)
    .filter((p) => {
      const edited = new Date(p.lastEdited);
      return !Number.isNaN(edited.getTime()) && edited >= cutoff;
    })
    .sort((a, b) => new Date(b.lastEdited).getTime() - new Date(a.lastEdited).getTime());

  const grouped = new Map<string, CrawledPage[]>();
  for (const page of recent) {
    const key = groupKey(page);
    const list = grouped.get(key) ?? [];
    list.push(page);
    grouped.set(key, list);
  }

  const groups: DigestGroup[] = [];
  for (const [title, pages] of grouped) {
    groups.push({
      title,
      summary: await summarizeGroup(title, pages, deps.model),
      pages: pages.map((p) => ({ title: p.title, url: p.url, lastEdited: p.lastEdited })),
    });
  }

  return { since: cutoff.toISOString(), pageCount: recent.length, groups };
}
