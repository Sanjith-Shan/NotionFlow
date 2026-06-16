import type { ChatMessage, ChatModel } from "../llm/provider";

// The slice of the Notion client the creator needs. Declaring it as an
// interface keeps creation testable with a fake.
export interface PageCreator {
  createPage(input: {
    parentId: string;
    parentType: "page" | "data_source";
    title: string;
    markdown: string;
  }): Promise<{ id: string; url: string }>;
}

export interface GeneratedPage {
  title: string;
  markdown: string;
}

export interface CreatedPage extends GeneratedPage {
  id: string;
  url: string;
  created: boolean;
}

const CREATE_SYSTEM_PROMPT =
  "You turn a short request into a clean, structured Notion document written in " +
  "markdown. Begin with a single level one heading for the title. Use level two " +
  "headings for sections and bullet lists where useful. Output only the markdown.";

// Pull a title out of generated markdown. Prefer the first heading.
export function parseTitle(markdown: string): string {
  for (const line of markdown.split("\n")) {
    const heading = /^#\s+(.*)$/.exec(line.trim());
    if (heading && heading[1]) return heading[1].trim();
  }
  const firstLine = markdown.split("\n").find((l) => l.trim().length > 0);
  return firstLine?.trim().slice(0, 80) ?? "New page";
}

function templateFromPrompt(prompt: string): string {
  const title =
    prompt
      .trim()
      .replace(/^create\s+(a|an)?\s*/i, "")
      .trim() || "New page";
  const heading = title.charAt(0).toUpperCase() + title.slice(1);
  return [
    `# ${heading}`,
    "",
    "> Drafted from a request without a language model. Add an API key for richer generation.",
    "",
    "## Overview",
    prompt.trim(),
    "",
    "## Notes",
    "- ",
  ].join("\n");
}

// Generate the markdown for a new page from a natural language request.
export async function generatePageMarkdown(
  prompt: string,
  model: ChatModel | null,
): Promise<GeneratedPage> {
  if (!model) {
    const markdown = templateFromPrompt(prompt);
    return { title: parseTitle(markdown), markdown };
  }
  const messages: ChatMessage[] = [
    { role: "system", content: CREATE_SYSTEM_PROMPT },
    { role: "user", content: prompt },
  ];
  const markdown = (await model.complete(messages)).trim();
  return { title: parseTitle(markdown), markdown };
}

export interface CreatePageDeps {
  model: ChatModel | null;
  creator?: PageCreator;
  parentId?: string;
  parentType?: "page" | "data_source";
}

// Generate a page from a prompt and, when a creator and parent are supplied,
// write it into Notion. Otherwise return the draft for preview.
export async function createPageFromPrompt(
  prompt: string,
  deps: CreatePageDeps,
): Promise<CreatedPage> {
  const generated = await generatePageMarkdown(prompt, deps.model);

  if (deps.creator && deps.parentId) {
    const { id, url } = await deps.creator.createPage({
      parentId: deps.parentId,
      parentType: deps.parentType ?? "page",
      title: generated.title,
      markdown: generated.markdown,
    });
    return { ...generated, id, url, created: true };
  }

  return { ...generated, id: "", url: "", created: false };
}
