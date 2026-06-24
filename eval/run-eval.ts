import { readFile } from "node:fs/promises";
import { loadConfig } from "../src/config";
import { buildIndex } from "../src/embeddings/indexer";
import { createEmbedderFromMeta } from "../src/embeddings/embedder";
import { loadFixtureSnapshot } from "../src/snapshot";

// A small retrieval evaluation harness. For each golden question it measures two
// things that do not depend on a language model, so the score is deterministic.
//
//   factCoverage  fraction of expected facts present in the retrieved context
//   sourceRecall  fraction of expected source pages that were retrieved
//
// Treating retrieval quality as something to measure, not assume, is the point.

interface GoldenCase {
  id: string;
  question: string;
  expectAnswerIncludes: string[];
  expectSourceTitles: string[];
}

interface GoldenSet {
  cases: GoldenCase[];
}

const GOLDEN_PATH = "eval/golden.json";
const FLOOR = 0.5; // fail the run if mean source recall drops below this

function fraction(found: number, total: number): number {
  return total === 0 ? 1 : found / total;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const golden = JSON.parse(await readFile(GOLDEN_PATH, "utf8")) as GoldenSet;
  const snapshot = await loadFixtureSnapshot();

  const store = await buildIndex(snapshot.pages, { openaiKey: config.openaiKey });
  const embedder = createEmbedderFromMeta(store.embedder, { openaiKey: config.openaiKey });
  console.log(`Evaluating ${golden.cases.length} cases. Embedder ${store.embedder.mode}.\n`);

  let totalFact = 0;
  let totalSource = 0;

  for (const testCase of golden.cases) {
    const [queryEmbedding] = await embedder.embed([testCase.question]);
    const results = store.search(queryEmbedding ?? [], { k: 6, maxPerPage: 2 });

    const context = results
      .map((r) => r.chunk.text)
      .join(" \n ")
      .toLowerCase();
    const titles = results.map((r) => r.chunk.pageTitle.toLowerCase());

    const factsFound = testCase.expectAnswerIncludes.filter((f) =>
      context.includes(f.toLowerCase()),
    );
    const sourcesFound = testCase.expectSourceTitles.filter((t) =>
      titles.some((title) => title.includes(t.toLowerCase())),
    );

    const factScore = fraction(factsFound.length, testCase.expectAnswerIncludes.length);
    const sourceScore = fraction(sourcesFound.length, testCase.expectSourceTitles.length);
    totalFact += factScore;
    totalSource += sourceScore;

    const mark = sourceScore >= 0.5 ? "ok " : "MISS";
    console.log(
      `[${mark}] ${testCase.question}\n        facts ${(factScore * 100).toFixed(0)}%  sources ${(sourceScore * 100).toFixed(0)}%`,
    );
  }

  const n = golden.cases.length || 1;
  const meanFact = totalFact / n;
  const meanSource = totalSource / n;

  console.log("\nResults");
  console.log(`  mean fact coverage  ${(meanFact * 100).toFixed(1)}%`);
  console.log(`  mean source recall  ${(meanSource * 100).toFixed(1)}%`);

  if (meanSource < FLOOR) {
    console.error(
      `\nMean source recall ${(meanSource * 100).toFixed(1)}% is below the floor of ${FLOOR * 100}%.`,
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
