# NotionFlow

AI knowledge agent for Notion workspaces.

![CI](https://github.com/Sanjith-Shan/NotionFlow/actions/workflows/ci.yml/badge.svg)

NotionFlow turns a Notion workspace into a searchable knowledge base using retrieval augmented generation. It ships three things that share one pipeline. A Notion **Worker** with agent tools that Custom Agents and external agents can call. A **CLI** for talking to your workspace from the terminal. And a **React dashboard** for chat, auto tagging, and weekly digests.

It is built on Notion's Developer Platform, which launched in May 2026, using TypeScript, the Notion SDK v5, and OpenAI embeddings, with a dependency free fallback so the whole thing runs with no API keys at all.

> Douglas Engelbart spent his life on a single idea, augmenting human intellect rather than replacing it. NotionFlow is built in that spirit. The retrieval does the fetching and the cross referencing so a person keeps the judgment.

---

## Run it in thirty seconds, no keys required

```bash
git clone https://github.com/Sanjith-Shan/NotionFlow
cd NotionFlow
npm install
npm run demo
```

`npm run demo` indexes a bundled sample workspace, then answers questions, suggests tags, and builds a digest end to end. With no OpenAI or Notion key it uses a local TF-IDF retriever and extractive answers. Add a key and the same commands use embeddings and a language model instead.

To use the dashboard with the sample workspace.

```bash
npm run build:web
npm run serve
```

Then open http://localhost:3000. For live reloading during development run `npm run dev:web` in one terminal and `npm run serve` in another.

To index your own workspace, copy `.env.example` to `.env`, add a `NOTION_API_TOKEN`, share the pages you want indexed with the integration, then run `npm run index`.

---

## The three surfaces

**Worker.** `worker/src/index.ts` registers three agent tools using the `@notionhq/workers` SDK. `searchWorkspace` answers a question with cited sources. `suggestTags` proposes tags for a page from similar tagged pages. `weeklyDigest` summarizes recent activity. Each tool declares an input schema, an output schema, and a `readOnlyHint` so the platform knows the call is safe to auto execute.

**CLI.** A Commander based command line tool for indexing, asking, tagging, digesting, and creating pages. See the table below.

**Dashboard.** A single page React app served by Express. A chat panel with collapsible sources, a tag suggestion view, and a digest view that can save back to Notion.

---

## How it works

```
 Notion workspace
        |
        v
   crawler  ----- reads pages via the v5 Markdown API (pages.retrieveMarkdown)
        |
        v
   chunker  ----- splits each page on heading boundaries into 300 to 500 token chunks
        |
        v
  embedder  ----- OpenAI text-embedding-3-small, or a local TF-IDF fallback
        |
        v
   store    ----- in memory cosine search with JSON persistence
        |
        v
    rag     ----- retrieve top k, dedupe by page, generate an answer with sources
```

The retriever is the shared core. The Worker, the CLI, and the dashboard all build on it. The store is deliberately simple. No external vector database. A linear cosine scan is fast for the workspaces most people and small teams actually have, and it keeps the project self contained and easy to read.

---

## Retrieval evaluation

Retrieval quality is measured, not assumed. `eval/golden.json` is a set of question and answer cases tied to facts in the sample workspace. `npm run eval` scores two things that do not depend on a language model, so the result is deterministic.

```
fact coverage   how many expected facts appear in the retrieved context
source recall   how many expected source pages were actually retrieved
```

The harness fails if mean source recall drops below a floor, so a regression in chunking or ranking is caught in CI rather than in a demo.

---

## CLI commands

Run any command with `npm run cli -- <command>`. After `npm link` the same commands are available as `notionflow <command>`.

| Command                             | What it does                                                      |
| ----------------------------------- | ----------------------------------------------------------------- |
| `index`                             | Crawl the workspace and build the vector index                    |
| `ask "<question>"`                  | Answer a question with cited source pages                         |
| `tag [databaseId]`                  | Suggest tags for untagged pages. Omit the id to list databases    |
| `digest [--days 7]`                 | Summarize recent activity grouped by parent                       |
| `create "<prompt>" [--parent <id>]` | Draft a page from a request, and create it when a parent is given |
| `stats`                             | Show index size, embedder, and answer mode                        |
| `serve`                             | Start the web dashboard                                           |

Example.

```bash
npm run cli -- ask "What did we decide about the Pro tier price?"
```

---

## The Notion Worker

The Worker is the headline. It runs custom code on Notion's hosted runtime and exposes tools that any agent in the workspace can call.

```bash
curl -fsSL https://ntn.dev | bash    # install the Notion CLI
ntn login                            # authenticate

cd worker
npm install
npm run build:worker-corpus          # from the repo root, refresh the bundled corpus

# run a tool locally for testing
ntn workers exec searchWorkspace -d '{"query":"why did we choose Postgres","maxResults":5}'

# deploy to your workspace
ntn workers deploy
```

The Worker bundles a trimmed snapshot of the workspace plus a standalone copy of the retrieval core, so it deploys on its own. `suggestTags` also reads live pages through the preauthenticated context client when a page is not in the bundle. Deploying to a live workspace requires a Business plan. The tools run locally with `ntn workers exec` without one.

---

## Architecture

```
worker/                 Notion Worker. Three agent tools and a standalone retriever.
src/notion/             Client wrapper (rate limiting, retry, v5 data sources), crawler, markdown.
src/embeddings/         Chunker, embedder (OpenAI and TF-IDF), vector store, index builder.
src/agent/              RAG, tagger, summarizer, page creator.
src/llm/                Pluggable chat model. OpenAI or Anthropic, with an extractive fallback.
src/cli/                Commander based command line interface.
src/web/                React dashboard.
server/                 Express server and the API service layer.
scripts/                Indexing, demo, and corpus generation scripts.
eval/                   Golden set and the retrieval evaluation harness.
tests/                  Vitest unit, integration, and component tests.
```

A longer write up of the design tradeoffs lives in [DESIGN.md](DESIGN.md).

---

## Testing

```bash
npm run check            # format check, lint, typecheck, and tests
npm run test:coverage    # tests with a coverage report
```

The suite covers the chunker, the vector store, both embedders, the RAG flow, the tagger, the summarizer, the page creator, the rate limited client, the crawler, the index builder, the Express API, the Worker retriever, and the chat component. External services are mocked so tests run offline and stay deterministic.

---

## Built on

- [Notion Developer Platform](https://www.notion.com/product/dev), Workers and the External Agents API
- [`@notionhq/workers`](https://developers.notion.com/workers) and the [`ntn` CLI](https://developers.notion.com/cli/get-started/overview)
- [`@notionhq/client`](https://github.com/makenotion/notion-sdk-js) v5, including the new Markdown API and data sources
- OpenAI embeddings and chat, or Anthropic Claude, both optional

---

## License

MIT. See [LICENSE](LICENSE).
