// Conversion helpers between Notion blocks and markdown.
//
// Notion's SDK v5 ships a native Markdown API (pages.retrieveMarkdown and
// pages.create with a markdown body), which the crawler and creator prefer.
// These hand written converters remain useful as a documented fallback for
// blocks fetched the older way, and they keep the project understandable
// without depending on a server round trip. They are also fully unit tested.

export interface RichTextLike {
  plain_text?: string;
  text?: { content: string; link?: { url: string } | null } | null;
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    code?: boolean;
  };
  href?: string | null;
}

export interface BlockLike {
  type: string;
  // Notion nests the block payload under a key equal to its type, for example
  // a paragraph block stores its content under block.paragraph.
  [key: string]: unknown;
}

function textOf(rt: RichTextLike): string {
  return rt.plain_text ?? rt.text?.content ?? "";
}

function applyAnnotations(content: string, rt: RichTextLike): string {
  if (!content) return content;
  let out = content;
  const a = rt.annotations ?? {};
  if (a.code) out = "`" + out + "`";
  if (a.bold) out = `**${out}**`;
  if (a.italic) out = `*${out}*`;
  if (a.strikethrough) out = `~~${out}~~`;
  const href = rt.href ?? rt.text?.link?.url ?? null;
  if (href) out = `[${out}](${href})`;
  return out;
}

// Render a Notion rich text array to inline markdown.
export function richTextToMarkdown(richText: RichTextLike[] | undefined): string {
  if (!richText || richText.length === 0) return "";
  return richText.map((rt) => applyAnnotations(textOf(rt), rt)).join("");
}

function payload(block: BlockLike): Record<string, unknown> {
  return (block[block.type] as Record<string, unknown>) ?? {};
}

function richTextField(block: BlockLike): RichTextLike[] {
  const data = payload(block);
  return (data.rich_text as RichTextLike[] | undefined) ?? [];
}

// Block types that carry no text we can embed are skipped during conversion.
const SKIPPED = new Set(["image", "video", "embed", "file", "pdf", "bookmark", "divider"]);

// Convert an array of Notion blocks to clean markdown text suitable for
// embedding. Unknown or non textual blocks are skipped rather than throwing.
export function blocksToMarkdown(blocks: BlockLike[]): string {
  const lines: string[] = [];
  let numberedCounter = 0;

  for (const block of blocks) {
    const type = block.type;
    if (type !== "numbered_list_item") numberedCounter = 0;
    if (SKIPPED.has(type)) continue;

    const text = richTextToMarkdown(richTextField(block));

    switch (type) {
      case "heading_1":
        lines.push(`# ${text}`);
        break;
      case "heading_2":
        lines.push(`## ${text}`);
        break;
      case "heading_3":
        lines.push(`### ${text}`);
        break;
      case "paragraph":
        lines.push(text);
        break;
      case "bulleted_list_item":
        lines.push(`- ${text}`);
        break;
      case "numbered_list_item":
        numberedCounter += 1;
        lines.push(`${numberedCounter}. ${text}`);
        break;
      case "to_do": {
        const checked = (payload(block).checked as boolean | undefined) ?? false;
        lines.push(`- [${checked ? "x" : " "}] ${text}`);
        break;
      }
      case "quote":
        lines.push(`> ${text}`);
        break;
      case "callout":
        lines.push(`> ${text}`);
        break;
      case "toggle":
        lines.push(text);
        break;
      case "code": {
        const language = (payload(block).language as string | undefined) ?? "";
        lines.push("```" + language + "\n" + text + "\n```");
        break;
      }
      case "child_page": {
        const title = (payload(block).title as string | undefined) ?? "";
        if (title) lines.push(`## ${title}`);
        break;
      }
      default:
        if (text) lines.push(text);
        break;
    }
  }

  // Collapse runs of blank lines and trim the edges.
  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// A minimal markdown block request, structurally compatible with the Notion
// create page api. Typed loosely so callers can hand it straight to the SDK.
export type MarkdownBlock = Record<string, unknown>;

function richTextRequest(content: string): MarkdownBlock[] {
  if (!content) return [];
  return [{ type: "text", text: { content } }];
}

function block(type: string, content: string, extra: Record<string, unknown> = {}): MarkdownBlock {
  return {
    object: "block",
    type,
    [type]: { rich_text: richTextRequest(content), ...extra },
  };
}

// Convert simple markdown to Notion block requests. This is deliberately small.
// It covers headings, bullet and numbered lists, todos, quotes, fenced code,
// and paragraphs, which is enough for the documents NotionFlow generates.
export function markdownToBlocks(markdown: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (trimmed === "") {
      i += 1;
      continue;
    }

    // Fenced code block.
    if (trimmed.startsWith("```")) {
      const language = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !(lines[i] ?? "").trim().startsWith("```")) {
        codeLines.push(lines[i] ?? "");
        i += 1;
      }
      i += 1; // skip closing fence
      blocks.push({
        object: "block",
        type: "code",
        code: {
          rich_text: richTextRequest(codeLines.join("\n")),
          language: language || "plain text",
        },
      });
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      const level = heading[1]?.length ?? 1;
      blocks.push(block(`heading_${level}`, heading[2] ?? ""));
      i += 1;
      continue;
    }

    const todo = /^[-*]\s+\[( |x|X)\]\s+(.*)$/.exec(trimmed);
    if (todo) {
      blocks.push(block("to_do", todo[2] ?? "", { checked: todo[1]?.toLowerCase() === "x" }));
      i += 1;
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
    if (bullet) {
      blocks.push(block("bulleted_list_item", bullet[1] ?? ""));
      i += 1;
      continue;
    }

    const numbered = /^\d+\.\s+(.*)$/.exec(trimmed);
    if (numbered) {
      blocks.push(block("numbered_list_item", numbered[1] ?? ""));
      i += 1;
      continue;
    }

    if (trimmed.startsWith(">")) {
      blocks.push(block("quote", trimmed.replace(/^>\s?/, "")));
      i += 1;
      continue;
    }

    blocks.push(block("paragraph", trimmed));
    i += 1;
  }

  return blocks;
}
