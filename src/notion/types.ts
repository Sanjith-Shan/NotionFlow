// Shared domain types for crawled Notion content. These intentionally flatten
// Notion's deep API response shapes into the small set of fields NotionFlow
// actually needs for retrieval, tagging, and digests.

export interface PageProperties {
  tags?: string[];
  status?: string;
  [key: string]: unknown;
}

export interface CrawledPage {
  id: string;
  title: string;
  url: string;
  markdown: string;
  lastEdited: string; // ISO 8601
  parentId: string | null;
  parentTitle: string | null;
  databaseId: string | null;
  properties: PageProperties;
}

// A page without its body. The crawler first lists summaries, then fetches each
// page's markdown so progress can be reported and rate limits respected.
export type PageSummary = Omit<CrawledPage, "markdown">;

export interface DatabaseMeta {
  id: string;
  title: string;
  dataSourceId: string;
  tagOptions: string[];
}

export interface WorkspaceSnapshot {
  databases: DatabaseMeta[];
  pages: CrawledPage[];
}

// Build the canonical Notion url for a page id. Notion accepts the id with the
// hyphens removed in the path.
export function pageUrl(id: string): string {
  return `https://notion.so/${id.replace(/-/g, "")}`;
}
