import chalk from "chalk";
import { loadConfig } from "../config";
import { createEmbedderForCorpus } from "../embeddings/embedder";
import { answerQuestion } from "../agent/rag";
import { createPageFromPrompt } from "../agent/creator";
import { suggestTagsForDatabase } from "../agent/tagger";
import { weeklyDigest } from "../agent/summarizer";
import { indexWorkspace } from "../index-job";
import { NotionClient } from "../notion/client";
import { createChatModel } from "../llm/provider";
import { createRuntime } from "../runtime";
import { getSnapshot } from "../snapshot";

function providerLabel(): string {
  const config = loadConfig();
  if (config.llmProvider === "none") return chalk.yellow("extractive (no LLM key)");
  return chalk.green(config.llmProvider);
}

export async function cmdIndex(): Promise<void> {
  const config = loadConfig();
  console.log(chalk.bold("Indexing workspace..."));
  if (!config.notionToken) {
    console.log(chalk.yellow("No NOTION_API_TOKEN set. Indexing the bundled sample workspace."));
  }

  const result = await indexWorkspace(config, (done, total, title) => {
    process.stdout.write(`\r  ${done}/${total} ${chalk.dim(title.slice(0, 50))}`.padEnd(72));
  });

  process.stdout.write("\n");
  console.log(
    chalk.green("Done."),
    `Indexed ${chalk.bold(String(result.pages))} pages into ${chalk.bold(
      String(result.chunks),
    )} chunks.`,
  );
  console.log(chalk.dim(`Source ${result.source}. Index written to ${result.indexPath}.`));
}

export async function cmdAsk(question: string): Promise<void> {
  const config = loadConfig();
  const runtime = await createRuntime(config);
  console.log(
    chalk.dim(
      `Searching ${runtime.store.size} chunks. Answering with ${runtime.model?.name ?? "extractive mode"}.`,
    ),
  );

  const result = await answerQuestion(question, runtime, { k: 6, maxPerPage: 2 });

  console.log("\n" + chalk.bold(result.answer) + "\n");
  if (result.sources.length > 0) {
    console.log(chalk.dim("Sources"));
    for (const source of result.sources) {
      console.log(
        `  ${chalk.cyan(source.pageTitle)} ${chalk.dim(`(${source.relevanceScore})`)}\n  ${chalk.dim(source.pageUrl)}`,
      );
    }
  }
}

export async function cmdTag(databaseId?: string): Promise<void> {
  const config = loadConfig();
  const { snapshot, source } = await getSnapshot(config);

  if (!databaseId) {
    console.log(chalk.bold("Databases"));
    for (const db of snapshot.databases) {
      console.log(`  ${chalk.cyan(db.title)} ${chalk.dim(db.id)}`);
    }
    console.log(
      chalk.dim(`\nRun "notionflow tag <database-id>" to suggest tags. Source ${source}.`),
    );
    return;
  }

  const embedder = createEmbedderForCorpus(
    snapshot.pages.map((p) => `${p.title}\n${p.markdown}`),
    { openaiKey: config.openaiKey },
  );
  const suggestions = await suggestTagsForDatabase(snapshot, databaseId, embedder);

  if (suggestions.length === 0) {
    console.log(chalk.yellow("No untagged pages with confident suggestions found."));
    return;
  }
  for (const page of suggestions) {
    console.log(chalk.bold(page.pageTitle));
    for (const s of page.suggestions) {
      const pct = Math.round(s.confidence * 100);
      console.log(`  ${chalk.green(s.tag)} ${chalk.dim(`${pct}% confidence`)}`);
    }
    console.log("");
  }
}

export async function cmdDigest(days: number): Promise<void> {
  const config = loadConfig();
  const { snapshot } = await getSnapshot(config);
  const model = createChatModel(config);

  const digest = await weeklyDigest(snapshot, { model }, { days });

  console.log(
    chalk.bold(`Workspace digest. ${digest.pageCount} pages edited in the last ${days} days.`),
  );
  console.log(chalk.dim(`Since ${digest.since}\n`));
  for (const group of digest.groups) {
    console.log(chalk.cyan.bold(group.title));
    console.log(group.summary);
    console.log("");
  }
}

export interface CreateOptions {
  parent?: string;
  dataSource?: string;
}

export async function cmdCreate(prompt: string, options: CreateOptions): Promise<void> {
  const config = loadConfig();
  const model = createChatModel(config);

  const parentId = options.parent ?? options.dataSource;
  const parentType = options.dataSource ? "data_source" : "page";
  const creator =
    config.notionToken && parentId ? NotionClient.fromToken(config.notionToken) : undefined;

  const result = await createPageFromPrompt(prompt, { model, creator, parentId, parentType });

  if (result.created) {
    console.log(chalk.green("Created page."), chalk.dim(result.url));
  } else {
    console.log(
      chalk.yellow("Draft only. Pass --parent <pageId> with a NOTION_API_TOKEN to create it.\n"),
    );
    console.log(result.markdown);
  }
}

export async function cmdStats(): Promise<void> {
  const config = loadConfig();
  const runtime = await createRuntime(config);
  const stats = runtime.store.stats();
  console.log(chalk.bold("Index stats"));
  console.log(`  Pages       ${chalk.cyan(String(stats.pages))}`);
  console.log(`  Chunks      ${chalk.cyan(String(stats.chunks))}`);
  console.log(`  Embedder    ${chalk.cyan(stats.embedderMode)} (${stats.dimensions} dims)`);
  console.log(`  Built       ${chalk.dim(stats.createdAt)}`);
  console.log(`  Source      ${chalk.dim(runtime.source)}`);
  console.log(`  Answers     ${providerLabel()}`);
}
