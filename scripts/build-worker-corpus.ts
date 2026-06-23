import { readFile, writeFile } from "node:fs/promises";
import { loadFixtureSnapshot } from "../src/snapshot";

// Generate the corpus the Worker bundles. This trims the sample workspace down
// to the fields the standalone Worker retriever needs and writes it next to the
// Worker source so it is included at deploy time.
async function main(): Promise<void> {
  const snapshot = await loadFixtureSnapshot();
  const corpus = snapshot.pages.map((page) => ({
    id: page.id,
    title: page.title,
    url: page.url,
    markdown: page.markdown,
    tags: page.properties.tags ?? [],
    status: page.properties.status,
    lastEdited: page.lastEdited,
    databaseId: page.databaseId,
    parentTitle: page.parentTitle ?? undefined,
  }));

  const outPath = "worker/src/corpus.json";
  await writeFile(outPath, JSON.stringify(corpus, null, 2), "utf8");
  // Confirm it parses back.
  JSON.parse(await readFile(outPath, "utf8"));
  console.log(`Wrote ${corpus.length} pages to ${outPath}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
