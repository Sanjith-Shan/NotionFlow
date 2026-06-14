import type { CrawledPage } from "../notion/types";

export interface Chunk {
  id: string; // pageId concatenated with chunk index
  pageId: string;
  pageTitle: string;
  sectionHeading: string;
  text: string;
  chunkIndex: number;
  url: string;
  lastEdited: string;
}

export interface ChunkOptions {
  // Soft upper bound on chunk size measured in estimated tokens.
  maxTokens?: number;
}

const DEFAULT_MAX_TOKENS = 500;

// Rough token estimate. About four characters per token is a good heuristic for
// English prose and avoids pulling in a tokenizer dependency.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

interface Section {
  heading: string;
  body: string;
}

const HEADING_RE = /^(#{1,3})\s+(.*)$/;

// Split markdown into sections on heading boundaries. Text before the first
// heading becomes an intro section keyed by the page title.
function splitIntoSections(markdown: string, pageTitle: string): Section[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const sections: Section[] = [];
  let heading = pageTitle;
  let body: string[] = [];

  const flush = () => {
    const text = body.join("\n").trim();
    if (text || sections.length === 0) {
      sections.push({ heading, body: text });
    }
    body = [];
  };

  for (const line of lines) {
    const match = HEADING_RE.exec(line.trim());
    if (match) {
      flush();
      heading = (match[2] ?? "").trim() || pageTitle;
    } else {
      body.push(line);
    }
  }
  flush();

  return sections.filter((s, i) => s.body.length > 0 || i === 0);
}

// Greedily pack paragraphs into chunks that stay under the token budget.
function packParagraphs(body: string, maxTokens: number): string[] {
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  const pushCurrent = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  for (const paragraph of paragraphs) {
    if (estimateTokens(paragraph) > maxTokens) {
      pushCurrent();
      chunks.push(...splitLongParagraph(paragraph, maxTokens));
      continue;
    }
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (estimateTokens(candidate) > maxTokens) {
      pushCurrent();
      current = paragraph;
    } else {
      current = candidate;
    }
  }
  pushCurrent();
  return chunks.length > 0 ? chunks : [body.trim()].filter(Boolean);
}

// Split a single oversized paragraph on sentence boundaries.
function splitLongParagraph(paragraph: string, maxTokens: number): string[] {
  const sentences = paragraph.match(/[^.!?]+[.!?]*\s*/g) ?? [paragraph];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    const candidate = current + sentence;
    if (estimateTokens(candidate) > maxTokens && current) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current = candidate;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

interface ChunkMeta {
  pageId: string;
  pageTitle: string;
  url: string;
  lastEdited: string;
}

// Convert a markdown document plus metadata into embeddable chunks. Each chunk
// is prefixed with its section heading so the heading travels with the body
// into the embedding, which measurably improves retrieval.
export function chunkMarkdown(
  markdown: string,
  meta: ChunkMeta,
  options: ChunkOptions = {},
): Chunk[] {
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const sections = splitIntoSections(markdown, meta.pageTitle);
  const chunks: Chunk[] = [];
  let index = 0;

  for (const section of sections) {
    const bodies =
      estimateTokens(section.body) <= maxTokens
        ? [section.body]
        : packParagraphs(section.body, maxTokens);

    for (const body of bodies) {
      if (!body.trim()) continue;
      const headingPrefix =
        section.heading && section.heading !== meta.pageTitle ? `${section.heading}\n\n` : "";
      chunks.push({
        id: `${meta.pageId}#${index}`,
        pageId: meta.pageId,
        pageTitle: meta.pageTitle,
        sectionHeading: section.heading,
        text: `${headingPrefix}${body.trim()}`,
        chunkIndex: index,
        url: meta.url,
        lastEdited: meta.lastEdited,
      });
      index += 1;
    }
  }

  return chunks;
}

export function chunkPage(page: CrawledPage, options: ChunkOptions = {}): Chunk[] {
  return chunkMarkdown(
    page.markdown,
    {
      pageId: page.id,
      pageTitle: page.title,
      url: page.url,
      lastEdited: page.lastEdited,
    },
    options,
  );
}
