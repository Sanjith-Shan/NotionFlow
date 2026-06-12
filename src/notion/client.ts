import { Client } from "@notionhq/client";
import type { DatabaseMeta, PageProperties, PageSummary } from "./types";
import { pageUrl } from "./types";

// Default delay between Notion api calls. The public api allows roughly three
// requests per second on free plans, so we space calls about 350ms apart.
const DEFAULT_INTERVAL_MS = 350;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface PacerOptions {
  intervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

// A tiny token spacer. Each call to wait resolves only once enough time has
// passed since the previous call, which keeps us under Notion's rate limit
// without a heavyweight dependency. The clock and sleep are injectable so the
// spacing can be tested deterministically.
export class Pacer {
  private readonly intervalMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private nextAllowed = 0;

  constructor(opts: PacerOptions = {}) {
    this.intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.now = opts.now ?? (() => Date.now());
    this.sleep = opts.sleep ?? defaultSleep;
  }

  async wait(): Promise<void> {
    const current = this.now();
    if (current < this.nextAllowed) {
      await this.sleep(this.nextAllowed - current);
    }
    this.nextAllowed = Math.max(current, this.nextAllowed) + this.intervalMs;
  }
}

// Decide whether a failed request is worth retrying. Rate limits and transient
// server errors are. Bad requests and auth failures are not.
export function isRetryable(error: unknown): boolean {
  const e = error as { status?: number; code?: string } | undefined;
  if (!e) return false;
  if (typeof e.status === "number" && (e.status === 429 || e.status >= 500)) return true;
  const retryableCodes = ["rate_limited", "internal_server_error", "service_unavailable"];
  return typeof e.code === "string" && retryableCodes.includes(e.code);
}

function retryAfterMs(error: unknown): number | undefined {
  const headers = (error as { headers?: Record<string, string> } | undefined)?.headers;
  const value = headers?.["retry-after"];
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) ? seconds * 1000 : undefined;
}

interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  sleep: (ms: number) => Promise<void>;
}

async function withRetry<T>(fn: () => Promise<T>, cfg: RetryConfig): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      attempt += 1;
      if (attempt > cfg.maxRetries || !isRetryable(error)) throw error;
      const backoff = cfg.baseDelayMs * 2 ** (attempt - 1);
      await cfg.sleep(retryAfterMs(error) ?? backoff);
    }
  }
}

// Minimal structural views of Notion api responses. The real SDK types are
// large discriminated unions. We narrow to just the fields NotionFlow reads.
interface RawProp {
  type?: string;
  title?: Array<{ plain_text?: string }>;
  rich_text?: Array<{ plain_text?: string }>;
  multi_select?: Array<{ name: string }>;
  select?: { name: string } | null;
  status?: { name: string } | null;
}

interface RawParent {
  type?: string;
  page_id?: string;
  database_id?: string;
  data_source_id?: string;
  workspace?: boolean;
}

interface RawPage {
  id: string;
  url?: string;
  last_edited_time?: string;
  parent?: RawParent;
  properties?: Record<string, RawProp>;
}

// Pull a human readable title out of a page's properties.
export function extractTitle(page: RawPage): string {
  const props = page.properties ?? {};
  for (const prop of Object.values(props)) {
    if (prop.type === "title" && prop.title) {
      const text = prop.title
        .map((t) => t.plain_text ?? "")
        .join("")
        .trim();
      if (text) return text;
    }
  }
  return "Untitled";
}

// Map the Notion property bag to the small set of properties NotionFlow uses,
// notably tags and status, while preserving any extra string values.
export function extractPageProperties(page: RawPage): PageProperties {
  const props = page.properties ?? {};
  const result: PageProperties = {};
  for (const [name, prop] of Object.entries(props)) {
    const key = name.toLowerCase();
    if (prop.type === "multi_select" && prop.multi_select) {
      const values = prop.multi_select.map((o) => o.name);
      if (key === "tags") result.tags = values;
      else result[name] = values;
    } else if (prop.type === "status" && prop.status) {
      if (key === "status") result.status = prop.status.name;
      else result[name] = prop.status.name;
    } else if (prop.type === "select" && prop.select) {
      if (key === "status") result.status = prop.select.name;
      else result[name] = prop.select.name;
    }
  }
  if (!result.tags) result.tags = [];
  return result;
}

// Determine which database or data source a page belongs to, if any.
export function extractDatabaseId(page: RawPage): string | null {
  const parent = page.parent;
  if (!parent) return null;
  return parent.data_source_id ?? parent.database_id ?? null;
}

function extractParentId(page: RawPage): string | null {
  const parent = page.parent;
  if (!parent) return null;
  return parent.page_id ?? parent.database_id ?? parent.data_source_id ?? null;
}

export interface NotionClientOptions {
  client: Client;
  pacer?: Pacer;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
  baseDelayMs?: number;
}

// The interface the crawler depends on. Keeping it small lets tests inject a
// fake source without standing up the whole SDK.
export interface CrawlSource {
  listAllPages(): Promise<PageSummary[]>;
  getPageMarkdown(pageId: string): Promise<string>;
  listDatabases(): Promise<DatabaseMeta[]>;
}

export interface CreatePageInput {
  parentId: string;
  parentType: "page" | "data_source";
  title: string;
  markdown: string;
  properties?: Record<string, unknown>;
}

// A thin, rate limited, retrying wrapper over the official Notion SDK. It
// handles pagination and flattens responses into NotionFlow's domain types.
export class NotionClient implements CrawlSource {
  private readonly client: Client;
  private readonly pacer: Pacer;
  private readonly retry: RetryConfig;

  constructor(options: NotionClientOptions) {
    this.client = options.client;
    this.pacer = options.pacer ?? new Pacer({ sleep: options.sleep });
    this.retry = {
      maxRetries: options.maxRetries ?? 4,
      baseDelayMs: options.baseDelayMs ?? 500,
      sleep: options.sleep ?? defaultSleep,
    };
  }

  static fromToken(token: string, options: Partial<NotionClientOptions> = {}): NotionClient {
    return new NotionClient({ client: new Client({ auth: token }), ...options });
  }

  private call<T>(fn: () => Promise<T>): Promise<T> {
    return this.pacer.wait().then(() => withRetry(fn, this.retry));
  }

  // List every page the integration can see, newest first.
  async listAllPages(): Promise<PageSummary[]> {
    const pages: PageSummary[] = [];
    let cursor: string | undefined;
    do {
      const response = await this.call(() =>
        this.client.search({
          filter: { property: "object", value: "page" },
          sort: { timestamp: "last_edited_time", direction: "descending" },
          page_size: 100,
          start_cursor: cursor,
        }),
      );
      for (const item of response.results) {
        const raw = item as unknown as RawPage;
        if (!raw.properties) continue; // skip partial results without properties
        pages.push({
          id: raw.id,
          title: extractTitle(raw),
          url: raw.url ?? pageUrl(raw.id),
          lastEdited: raw.last_edited_time ?? new Date(0).toISOString(),
          parentId: extractParentId(raw),
          parentTitle: null,
          databaseId: extractDatabaseId(raw),
          properties: extractPageProperties(raw),
        });
      }
      cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
    } while (cursor);
    return pages;
  }

  // Read a page's body using the native markdown api, which is far cheaper than
  // walking the block tree by hand.
  async getPageMarkdown(pageId: string): Promise<string> {
    const response = await this.call(() => this.client.pages.retrieveMarkdown({ page_id: pageId }));
    return (response as { markdown?: string }).markdown ?? "";
  }

  // List databases by searching for data source objects.
  async listDatabases(): Promise<DatabaseMeta[]> {
    const databases: DatabaseMeta[] = [];
    let cursor: string | undefined;
    do {
      const response = await this.call(() =>
        this.client.search({
          filter: { property: "object", value: "data_source" },
          page_size: 100,
          start_cursor: cursor,
        }),
      );
      for (const item of response.results) {
        const raw = item as unknown as {
          id: string;
          name?: string;
          title?: Array<{ plain_text?: string }>;
        };
        const title =
          raw.name ??
          raw.title
            ?.map((t) => t.plain_text ?? "")
            .join("")
            .trim() ??
          "Untitled";
        databases.push({ id: raw.id, title, dataSourceId: raw.id, tagOptions: [] });
      }
      cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
    } while (cursor);
    return databases;
  }

  // Query the rows of a data source, returning page summaries.
  async queryDataSource(
    dataSourceId: string,
    filter?: Record<string, unknown>,
  ): Promise<PageSummary[]> {
    const pages: PageSummary[] = [];
    let cursor: string | undefined;
    do {
      const response = await this.call(() =>
        this.client.dataSources.query({
          data_source_id: dataSourceId,
          filter: filter as never,
          page_size: 100,
          start_cursor: cursor,
        }),
      );
      for (const item of response.results) {
        const raw = item as unknown as RawPage;
        if (!raw.properties) continue;
        pages.push({
          id: raw.id,
          title: extractTitle(raw),
          url: raw.url ?? pageUrl(raw.id),
          lastEdited: raw.last_edited_time ?? new Date(0).toISOString(),
          parentId: extractParentId(raw),
          parentTitle: null,
          databaseId: dataSourceId,
          properties: extractPageProperties(raw),
        });
      }
      cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
    } while (cursor);
    return pages;
  }

  // Resolve the data sources that belong to a database.
  async getDatabaseDataSources(databaseId: string): Promise<string[]> {
    const response = await this.call(() =>
      this.client.databases.retrieve({ database_id: databaseId }),
    );
    const sources = (response as { data_sources?: Array<{ id: string }> }).data_sources ?? [];
    return sources.map((s) => s.id);
  }

  // Create a page from markdown using the native markdown body parameter.
  async createPage(input: CreatePageInput): Promise<{ id: string; url: string }> {
    const parent =
      input.parentType === "page"
        ? { page_id: input.parentId }
        : { data_source_id: input.parentId };
    const properties =
      input.properties ??
      (input.parentType === "page"
        ? { title: { title: [{ text: { content: input.title } }] } }
        : { Name: { title: [{ text: { content: input.title } }] } });
    const response = await this.call(() =>
      this.client.pages.create({
        parent: parent as never,
        properties: properties as never,
        markdown: input.markdown,
      } as never),
    );
    const created = response as { id: string; url?: string };
    return { id: created.id, url: created.url ?? pageUrl(created.id) };
  }

  // Apply a multi select tag list to a page's Tags property.
  async applyTags(pageId: string, tags: string[]): Promise<void> {
    await this.call(() =>
      this.client.pages.update({
        page_id: pageId,
        properties: {
          Tags: { multi_select: tags.map((name) => ({ name })) },
        } as never,
      }),
    );
  }
}
