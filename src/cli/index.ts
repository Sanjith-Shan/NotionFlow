#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import {
  cmdAsk,
  cmdCreate,
  cmdDigest,
  cmdIndex,
  cmdStats,
  cmdTag,
  type CreateOptions,
} from "./commands";

const program = new Command();

program
  .name("notionflow")
  .description("AI knowledge agent for Notion workspaces. Search, tag, and summarize.")
  .version("0.1.0");

program
  .command("index")
  .description("Crawl the workspace and build the vector index")
  .action(async () => {
    await cmdIndex();
  });

program
  .command("ask")
  .description("Ask a question about the workspace")
  .argument("<question...>", "the question to ask")
  .action(async (parts: string[]) => {
    await cmdAsk(parts.join(" "));
  });

program
  .command("tag")
  .description("Suggest tags for untagged pages in a database")
  .argument("[databaseId]", "database to analyze. Omit to list databases.")
  .action(async (databaseId?: string) => {
    await cmdTag(databaseId);
  });

program
  .command("digest")
  .description("Generate a digest of recent workspace activity")
  .option("-d, --days <days>", "look back window in days", "7")
  .action(async (options: { days: string }) => {
    await cmdDigest(Number(options.days));
  });

program
  .command("create")
  .description("Create a page from a natural language request")
  .argument("<prompt...>", "what the page should contain")
  .option("-p, --parent <pageId>", "parent page id to create under")
  .option("-s, --data-source <id>", "parent data source id to create under")
  .action(async (parts: string[], options: CreateOptions) => {
    await cmdCreate(parts.join(" "), options);
  });

program
  .command("stats")
  .description("Show index statistics")
  .action(async () => {
    await cmdStats();
  });

program
  .command("serve")
  .description("Start the web dashboard")
  .action(async () => {
    const { startServer } = await import("../../server/index");
    await startServer();
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(chalk.red("Error."), error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
