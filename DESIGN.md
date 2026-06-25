# Design notes

This document records the main decisions behind NotionFlow and the tradeoffs each one made. The theme is to keep the project small enough to read in one sitting while still behaving like production code.

## A linear in memory vector store, on purpose

The store keeps every chunk in memory and scores a query with a linear cosine scan, then persists to a single JSON file. It does not use Pinecone, Weaviate, or pgvector.

For a personal or small team workspace the corpus is a few thousand chunks. A linear scan over that is well under a millisecond, so a vector database would add operational weight and a network hop for no real gain. The cost shows up only past tens of thousands of chunks, at which point an approximate index or a hosted store would be worth it. The store interface is small, so swapping the backend later would not ripple outward. Choosing the simplest thing that fits the actual data size, rather than the most scalable thing in the abstract, was the point.

## The v5 Markdown API for crawling

Notion's older pattern is to fetch a page, then recursively fetch its block children, which can mean three or more requests per page. The SDK v5 ships `pages.retrieveMarkdown`, which returns a whole page as markdown in one call. The crawler uses it as the primary content path, which cuts indexing requests roughly threefold and removes a pile of block parsing.

A hand written block to markdown converter still lives in `src/notion/markdown.ts`. It is fully tested and serves as a documented fallback for content fetched the older way, and it keeps the conversion logic legible rather than hidden behind an API call.

## Runs with zero keys

A reviewer should be able to clone the repo and see it work without signing up for anything. So embeddings fall back to a local TF-IDF model and answer generation falls back to an extractive mode that stitches the most relevant snippets together. The same code paths light up with real embeddings and a language model the moment a key is present. The fallback also makes the test suite and the evaluation harness deterministic and offline.

## A pluggable answer provider

`src/llm/provider.ts` hides the choice of model behind a tiny `ChatModel` interface with one method. OpenAI and Anthropic Claude are both supported, and the absence of a key resolves to the extractive fallback rather than an error. Treating the model as a replaceable detail, not a hard dependency, keeps the retrieval logic honest and the tests fast.

## Rate limiting and retries

Notion allows roughly three requests per second. The client spaces calls with a small pacer and retries rate limits and transient server errors with exponential backoff, honoring a `retry-after` header when present. The clock and the sleep function are injectable, so the spacing is verified with a deterministic unit test rather than a real timer.

## The Worker is self contained

The Worker bundles a trimmed corpus and a standalone copy of the retrieval core rather than importing the main package across a directory boundary. This costs a little duplication but means `ntn workers deploy` packages one clean, readable file tree with no surprising cross package resolution. The Worker still uses its context client to read live pages on demand, which shows the real shape of a deployed tool.

## Incremental indexing

Re indexing reuses work in two places. The crawler keeps cached markdown for pages whose `last_edited_time` is unchanged, so it only refetches what changed. The index builder reuses prior embeddings for chunks whose text is unchanged when the embedder is OpenAI backed, so a re index only pays to embed new or edited content. TF-IDF vectors depend on the whole corpus, so they are always rebuilt, which is cheap.

## Designed for testing

Every module that touches the outside world takes its dependency as a parameter. The crawler depends on a small `CrawlSource` interface. The Express app is built around an `ApiServices` interface. The embedder and the chat model are passed in. This dependency injection is why the suite can mock Notion, OpenAI, and Anthropic and still exercise the real logic.

## Known limitations and next steps

- The store is in memory. Past tens of thousands of chunks it should move to an approximate index or a hosted store.
- Tag suggestion embeds whole pages. Chunk level tag signals would likely improve precision on long pages.
- The digest groups by parent. Cross page theme clustering would read better for very active workspaces.
- Answer quality is evaluated on retrieval. An LLM graded answer rubric would extend the harness once a key is part of CI.
