import { describe, it, expect } from "vitest";
import {
  blocksToMarkdown,
  markdownToBlocks,
  richTextToMarkdown,
  type BlockLike,
} from "../src/notion/markdown";

describe("richTextToMarkdown", () => {
  it("applies annotations", () => {
    expect(richTextToMarkdown([{ plain_text: "x", annotations: { bold: true } }])).toBe("**x**");
    expect(richTextToMarkdown([{ plain_text: "y", annotations: { italic: true } }])).toBe("*y*");
    expect(richTextToMarkdown([{ plain_text: "z", annotations: { code: true } }])).toBe("`z`");
  });

  it("renders links", () => {
    expect(richTextToMarkdown([{ plain_text: "site", href: "https://example.com" }])).toBe(
      "[site](https://example.com)",
    );
  });

  it("concatenates multiple spans", () => {
    expect(
      richTextToMarkdown([
        { plain_text: "Hello " },
        { plain_text: "world", annotations: { bold: true } },
      ]),
    ).toBe("Hello **world**");
  });
});

describe("blocksToMarkdown", () => {
  it("converts headings, lists, todos, quotes and code", () => {
    const blocks: BlockLike[] = [
      { type: "heading_2", heading_2: { rich_text: [{ plain_text: "Title" }] } },
      { type: "paragraph", paragraph: { rich_text: [{ plain_text: "Body" }] } },
      { type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ plain_text: "one" }] } },
      { type: "numbered_list_item", numbered_list_item: { rich_text: [{ plain_text: "first" }] } },
      { type: "numbered_list_item", numbered_list_item: { rich_text: [{ plain_text: "second" }] } },
      { type: "to_do", to_do: { rich_text: [{ plain_text: "task" }], checked: true } },
      { type: "quote", quote: { rich_text: [{ plain_text: "quoted" }] } },
      { type: "code", code: { rich_text: [{ plain_text: "x = 1" }], language: "python" } },
    ];
    const md = blocksToMarkdown(blocks);
    expect(md).toContain("## Title");
    expect(md).toContain("- one");
    expect(md).toContain("1. first");
    expect(md).toContain("2. second");
    expect(md).toContain("- [x] task");
    expect(md).toContain("> quoted");
    expect(md).toContain("```python\nx = 1\n```");
  });

  it("skips non textual blocks", () => {
    const blocks: BlockLike[] = [
      { type: "image", image: {} },
      { type: "paragraph", paragraph: { rich_text: [{ plain_text: "kept" }] } },
    ];
    expect(blocksToMarkdown(blocks)).toBe("kept");
  });
});

describe("markdownToBlocks", () => {
  it("parses headings, lists, and code fences", () => {
    const blocks = markdownToBlocks("# H\n\n- a\n- b\n\n```js\ncode\n```");
    const types = blocks.map((b) => b.type);
    expect(types).toEqual(["heading_1", "bulleted_list_item", "bulleted_list_item", "code"]);
    const code = blocks[3] as { code: { language: string } };
    expect(code.code.language).toBe("js");
  });

  it("treats plain lines as paragraphs", () => {
    const blocks = markdownToBlocks("Just a sentence.");
    expect(blocks[0]?.type).toBe("paragraph");
  });
});
