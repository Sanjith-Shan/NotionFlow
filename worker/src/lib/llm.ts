// Optional language model calls for the Worker. The Worker runtime can make
// outbound HTTP and read secrets set with `ntn workers env set`. When no key is
// present these functions fall back to an extractive result, so the tools work
// in the sandbox with no configuration.

import type { CorpusPage } from "./retriever";

const SYSTEM =
  "You answer questions about a Notion workspace using only the provided context. " +
  "If the context is insufficient, say so. Cite the page titles you used.";

function snippet(text: string, length = 220): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > length ? `${clean.slice(0, length)}...` : clean;
}

function extractiveAnswer(question: string, pages: CorpusPage[]): string {
  const top = pages.slice(0, 3);
  const lines = top.map((p) => `From "${p.title}". ${snippet(p.markdown)}`);
  return [
    `Here is what the workspace says about "${question}".`,
    "",
    ...lines.map((l) => `- ${l}`),
  ].join("\n");
}

async function callOpenAi(
  messages: Array<{ role: string; content: string }>,
): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini", temperature: 0.2, max_tokens: 800, messages }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

export async function generateAnswer(question: string, pages: CorpusPage[]): Promise<string> {
  const context = pages
    .map((p) => `Page "${p.title}":\n${p.markdown.slice(0, 1500)}`)
    .join("\n\n---\n\n");
  const llm = await callOpenAi([
    { role: "system", content: SYSTEM },
    { role: "user", content: `Context:\n${context}\n\nQuestion: ${question}` },
  ]);
  return llm ?? extractiveAnswer(question, pages);
}

export async function summarizeGroup(title: string, pages: CorpusPage[]): Promise<string> {
  const body = pages.map((p) => `Page "${p.title}":\n${snippet(p.markdown, 400)}`).join("\n\n");
  const llm = await callOpenAi([
    {
      role: "system",
      content: "Summarize recent Notion activity into two or three concise factual bullet points.",
    },
    { role: "user", content: `Section "${title}". Recently edited pages:\n\n${body}` },
  ]);
  return llm ?? pages.map((p) => `- ${p.title}. ${snippet(p.markdown, 120)}`).join("\n");
}
