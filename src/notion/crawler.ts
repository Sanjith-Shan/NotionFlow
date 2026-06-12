import type { CrawlSource } from "./client";
import type { CrawledPage, WorkspaceSnapshot } from "./types";

export interface CrawlOptions {
  // A previously crawled set of pages. Pages whose lastEdited is unchanged keep
  // their cached markdown, so re crawling only fetches content that changed.
  previous?: CrawledPage[];
  onProgress?: (done: number, total: number, title: string) => void;
}

// Crawl an entire workspace into a flat snapshot. Listing happens first so we
// know the total page count, then each page body is fetched in turn. The
// underlying client spaces requests to respect Notion's rate limit.
export async function crawlWorkspace(
  source: CrawlSource,
  options: CrawlOptions = {},
): Promise<WorkspaceSnapshot> {
  const previousById = new Map((options.previous ?? []).map((p) => [p.id, p]));

  const summaries = await source.listAllPages();
  const databases = await source.listDatabases();

  const pages: CrawledPage[] = [];
  let done = 0;
  for (const summary of summaries) {
    const cached = previousById.get(summary.id);
    const markdown =
      cached && cached.lastEdited === summary.lastEdited
        ? cached.markdown
        : await source.getPageMarkdown(summary.id);
    pages.push({ ...summary, markdown });
    done += 1;
    options.onProgress?.(done, summaries.length, summary.title);
  }

  return { databases, pages };
}
