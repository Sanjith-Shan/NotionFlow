import { loadConfig } from "../src/config";
import { indexWorkspace } from "../src/index-job";

// One shot workspace indexing. Crawls the workspace (or the sample workspace
// when no token is set), builds the vector index, and writes it to disk.
async function main(): Promise<void> {
  const config = loadConfig();
  console.log("Indexing workspace...");
  if (!config.notionToken) {
    console.log("No NOTION_API_TOKEN set. Using the bundled sample workspace.");
  }

  const result = await indexWorkspace(config, (done, total, title) => {
    process.stdout.write(`\r  ${done}/${total} ${title.slice(0, 50)}`.padEnd(72));
  });

  process.stdout.write("\n");
  console.log(
    `Indexed ${result.pages} pages into ${result.chunks} chunks. Source ${result.source}.`,
  );
  console.log(`Index written to ${result.indexPath}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
