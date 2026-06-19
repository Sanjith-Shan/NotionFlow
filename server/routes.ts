import express, { type Express, type Request, type Response, type NextFunction } from "express";
import type { RagAnswer } from "../src/agent/rag";
import type { PageTagSuggestions } from "../src/agent/tagger";
import type { Digest } from "../src/agent/summarizer";
import type { CreatedPage } from "../src/agent/creator";
import type { DatabaseMeta } from "../src/notion/types";

export interface StatsResponse {
  pages: number;
  chunks: number;
  embedderMode: string;
  dimensions: number;
  createdAt: string;
  source: string;
  provider: string;
}

// The operations the HTTP layer exposes. Declaring this as an interface keeps
// the routes decoupled from how the work is actually done, which makes the app
// straightforward to test with a fake.
export interface ApiServices {
  stats(): Promise<StatsResponse>;
  search(query: string, maxResults?: number): Promise<RagAnswer>;
  databases(): Promise<DatabaseMeta[]>;
  tag(databaseId: string): Promise<PageTagSuggestions[]>;
  applyTags(pageId: string, tags: string[]): Promise<{ applied: boolean }>;
  digest(days: number): Promise<Digest>;
  create(prompt: string, parentId?: string): Promise<CreatedPage>;
  reindex(): Promise<StatsResponse>;
}

function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, `Field "${field}" is required.`);
  }
  return value;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// Build the Express app around a set of services. No global state, so each test
// can pass its own fake.
export function createApp(services: ApiServices): Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get(
    "/api/stats",
    asyncHandler(async (_req, res) => {
      res.json(await services.stats());
    }),
  );

  app.post(
    "/api/search",
    asyncHandler(async (req, res) => {
      const query = requireString(req.body?.query, "query");
      const maxResults = typeof req.body?.maxResults === "number" ? req.body.maxResults : undefined;
      res.json(await services.search(query, maxResults));
    }),
  );

  app.get(
    "/api/databases",
    asyncHandler(async (_req, res) => {
      res.json(await services.databases());
    }),
  );

  app.post(
    "/api/tag",
    asyncHandler(async (req, res) => {
      const databaseId = requireString(req.body?.databaseId, "databaseId");
      res.json(await services.tag(databaseId));
    }),
  );

  app.post(
    "/api/tag/apply",
    asyncHandler(async (req, res) => {
      const pageId = requireString(req.body?.pageId, "pageId");
      const tags = Array.isArray(req.body?.tags) ? (req.body.tags as string[]) : [];
      res.json(await services.applyTags(pageId, tags));
    }),
  );

  app.post(
    "/api/digest",
    asyncHandler(async (req, res) => {
      const days = typeof req.body?.days === "number" ? req.body.days : 7;
      res.json(await services.digest(days));
    }),
  );

  app.post(
    "/api/create",
    asyncHandler(async (req, res) => {
      const prompt = requireString(req.body?.prompt, "prompt");
      const parentId = typeof req.body?.parentId === "string" ? req.body.parentId : undefined;
      res.json(await services.create(prompt, parentId));
    }),
  );

  app.post(
    "/api/index",
    asyncHandler(async (_req, res) => {
      res.json(await services.reindex());
    }),
  );

  // Centralized error handling. Known HttpErrors keep their status. Everything
  // else becomes a 500 with the message.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(status).json({ error: message });
  });

  return app;
}
