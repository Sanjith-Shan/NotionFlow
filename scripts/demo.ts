import { loadConfig } from "../src/config";
import { buildIndex } from "../src/embeddings/indexer";
import { createEmbedderForCorpus, createEmbedderFromMeta } from "../src/embeddings/embedder";
import { loadFixtureSnapshot } from "../src/snapshot";
import { answerQuestion } from "../src/agent/rag";
import { suggestTagsForDatabase } from "../src/agent/tagger";
import { weeklyDigest } from "../src/agent/summarizer";
import { createChatModel } from "../src/llm/provider";

// End to end demo over the bundled sample workspace. Runs entirely offline when
// no API keys are present, using TF-IDF retrieval and extractive answers.
function rule(label: string): void {
  console.log(`\n${"=".repeat(8)} ${label} ${"=".repeat(8)}`);
}

async function main(): Promise<void> {
  const config = loadConfig();
  const snapshot = await loadFixtureSnapshot();
  console.log(
    `Loaded sample workspace. ${snapshot.pages.length} pages, ${snapshot.databases.length} databases.`,
  );

  const store = await buildIndex(snapshot.pages, { openaiKey: config.openaiKey });
  const embedder = createEmbedderFromMeta(store.embedder, { openaiKey: config.openaiKey });
  const model = createChatModel(config);
  console.log(
    `Built index. ${store.size} chunks. Embedder ${store.embedder.mode}. Answers ${model?.name ?? "extractive"}.`,
  );

  rule("ASK");
  for (const question of ["What did we price the Pro tier at?", "Why did we choose Postgres?"]) {
    const result = await answerQuestion(
      question,
      { store, embedder, model },
      { k: 6, maxPerPage: 2 },
    );
    console.log(`\nQ. ${question}`);
    console.log(result.answer);
    console.log("Sources. " + result.sources.map((s) => s.pageTitle).join(", "));
  }

  rule("TAG");
  const db = snapshot.databases[0];
  if (db) {
    const tagEmbedder = createEmbedderForCorpus(
      snapshot.pages.map((p) => `${p.title}\n${p.markdown}`),
      { openaiKey: config.openaiKey },
    );
    const suggestions = await suggestTagsForDatabase(snapshot, db.id, tagEmbedder);
    console.log(`Tag suggestions for "${db.title}".`);
    for (const page of suggestions.slice(0, 3)) {
      const tags = page.suggestions
        .map((s) => `${s.tag} (${Math.round(s.confidence * 100)}%)`)
        .join(", ");
      console.log(`  ${page.pageTitle}. ${tags}`);
    }
  }

  rule("DIGEST");
  // The sample workspace is a snapshot in time, so anchor the digest window to
  // its most recent edit. That keeps the demo meaningful no matter when it runs.
  const latest = Math.max(...snapshot.pages.map((p) => new Date(p.lastEdited).getTime()));
  const now = () => new Date(latest + 1000);
  const digest = await weeklyDigest(snapshot, { model, now }, { days: 7 });
  console.log(`${digest.pageCount} pages edited recently across ${digest.groups.length} groups.`);
  for (const group of digest.groups) {
    console.log(`\n${group.title}`);
    console.log(group.summary);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
