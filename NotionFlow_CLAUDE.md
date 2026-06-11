# NotionFlow - AI Knowledge Agent for Notion Workspaces

## CLAUDE.md - Build Specification for Claude Code

### What This Is

NotionFlow is a Notion Developer Platform project that does two things. First, it ships a Notion Worker with agent tools that Custom Agents can call to search, summarize, and cross-reference workspace content using RAG over embedded page content. Second, it ships a standalone TypeScript CLI and React web dashboard for chatting with your Notion workspace through the same RAG pipeline. The project demonstrates fluency with Notion's brand-new Developer Platform (launched May 13, 2026), their API, their CLI (ntn), and their Workers runtime.

This is a portfolio project for Sanjith Shanmugavel (github.com/Sanjith-Shan), specifically targeting the Notion SWE internship (Fall 2026, Product/Platform). The project should demonstrate product intuition for Notion's AI agent ecosystem, TypeScript and React proficiency, and the ability to build on a platform that is weeks old with minimal documentation.

### Style Rules

Never use em dashes, colons, or semicolons in any written prose (README, comments, docs). Use periods or restructure sentences instead. Code syntax (TypeScript type annotations, object literals) is exempt from this rule.

---

## Why This Project Matters for Notion

Notion's Developer Platform just launched with three primitives: Workers (serverless custom code), External Agents API (bring your own agents), and Database Sync. Workers are in public beta and free through August 2026. Almost nobody has built on them yet. Building a real Worker with agent tools shows the hiring manager that the candidate understands where Notion is going, not just where it is.

The project also demonstrates the core technical loop that Notion's Product and Platform teams work on every day: read workspace content, make it intelligently searchable, and let agents take action on it.

---

## Project Structure

```
NotionFlow/
├── CLAUDE.md
├── README.md
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── worker/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       └── index.ts              # Notion Worker with agent tools
├── src/
│   ├── notion/
│   │   ├── client.ts             # Notion API client wrapper
│   │   ├── crawler.ts            # Crawl all accessible pages and databases
│   │   ├── markdown.ts           # Convert Notion blocks to/from markdown
│   │   └── types.ts              # Type definitions for Notion content
│   ├── embeddings/
│   │   ├── chunker.ts            # Split pages into semantic chunks
│   │   ├── embedder.ts           # Generate embeddings via OpenAI API
│   │   └── store.ts              # Local vector store (in-memory + JSON persistence)
│   ├── agent/
│   │   ├── rag.ts                # RAG retrieval and answer generation
│   │   ├── tagger.ts             # Auto-tag untagged pages based on content similarity
│   │   ├── summarizer.ts         # Generate summaries from recent page updates
│   │   └── creator.ts            # Create structured pages from natural language
│   ├── cli/
│   │   ├── index.ts              # CLI entry point
│   │   └── commands.ts           # CLI command definitions
│   └── web/
│       ├── index.html            # Single-page React app shell
│       ├── App.tsx               # Main app component
│       ├── components/
│       │   ├── Chat.tsx          # Chat interface for workspace Q&A
│       │   ├── SearchResults.tsx # Display retrieved pages with snippets
│       │   ├── TagSuggestions.tsx # Show auto-tag suggestions
│       │   └── Summary.tsx       # Weekly summary display
│       └── api.ts                # Client-side API calls to local server
├── server/
│   ├── index.ts                  # Express server for web UI
│   └── routes.ts                 # API routes (search, tag, summarize, create)
├── scripts/
│   ├── index-workspace.ts        # One-time full workspace indexing
│   └── demo.ts                   # Demo script showing all capabilities
└── tests/
    ├── chunker.test.ts
    ├── store.test.ts
    └── rag.test.ts
```

---

## Technology Stack

- TypeScript throughout (Notion's stack)
- @notionhq/client (official Notion SDK)
- @notionhq/workers (Workers SDK, for the Worker component)
- OpenAI API (text-embedding-3-small for embeddings, gpt-4o-mini for generation)
- React 18 with Tailwind CSS (for the web dashboard)
- Express.js (for the local API server)
- Commander.js (for CLI)
- Vite (for bundling the React app)
- Vitest (for tests)

---

## Component 1: Notion Worker (worker/)

The Worker is the headline component. It registers agent tools that Notion Custom Agents can call. This is built using the @notionhq/workers SDK.

### worker/src/index.ts

```typescript
import { Worker } from "@notionhq/workers";
import { j } from "@notionhq/workers/schema-builder";

const worker = new Worker();
export default worker;
```

Register three agent tools:

### Tool 1: searchWorkspace

A RAG-powered semantic search across workspace content. The Custom Agent asks a question, this tool retrieves relevant page chunks, and returns a synthesized answer with source page links.

```
worker.tool("searchWorkspace", {
  title: "Search Workspace Knowledge",
  description: "Search across all indexed workspace pages using semantic similarity to answer a question. Returns an answer with source page links.",
  schema: j.object({
    query: j.string().describe("The question or search query"),
    maxResults: j.number().optional().describe("Max pages to retrieve, default 5")
  }),
  execute: async ({ query, maxResults }, { notion }) => {
    // 1. Embed the query
    // 2. Search the vector store for similar chunks
    // 3. Retrieve full page content for top matches via Notion API
    // 4. Call LLM with retrieved context + query
    // 5. Return answer + source page URLs
  }
});
```

### Tool 2: suggestTags

Analyzes an untagged page and suggests tags based on content similarity to already-tagged pages in the workspace.

```
worker.tool("suggestTags", {
  title: "Suggest Tags for Page",
  description: "Analyze a page's content and suggest tags based on similarity to tagged pages in the workspace.",
  schema: j.object({
    pageId: j.string().describe("The Notion page ID to analyze")
  }),
  execute: async ({ pageId }, { notion }) => {
    // 1. Retrieve page content
    // 2. Embed it
    // 3. Find similar already-tagged pages
    // 4. Extract common tags from similar pages
    // 5. Return tag suggestions with confidence scores
  }
});
```

### Tool 3: weeklyDigest

Generates a summary of workspace activity over the past 7 days by finding recently modified pages, extracting key changes, and producing a structured digest.

```
worker.tool("weeklyDigest", {
  title: "Generate Weekly Digest",
  description: "Summarize workspace activity from the past 7 days into a structured digest with key updates, new pages, and active projects.",
  schema: j.object({
    databaseId: j.string().optional().describe("Optionally scope to a specific database")
  }),
  execute: async ({ databaseId }, { notion }) => {
    // 1. Query recently modified pages (last 7 days)
    // 2. Group by database/parent
    // 3. Summarize each group with LLM
    // 4. Return structured digest
  }
});
```

### Worker Development Notes

- The Worker can be developed and tested locally with `ntn workers exec --local`
- For local testing, set NOTION_API_TOKEN in .env (personal access token)
- The vector store for the Worker should be pre-built by the indexing script and stored as a JSON file that the Worker reads
- If Workers deployment requires a Business plan that the developer doesn't have, the README should document exactly how to deploy it and include a video/gif of local execution instead
- The Worker code should be clean enough that someone at Notion could read it and immediately understand the architecture

---

## Component 2: Workspace Crawler (src/notion/)

### client.ts

Thin wrapper around @notionhq/client that handles pagination, rate limiting (3 req/s for free plans), and error retry. Export helper functions:

- `getAllPages()` - recursively list all accessible pages
- `getPageContent(pageId)` - retrieve all blocks for a page
- `getDatabases()` - list all databases
- `queryDatabase(dbId, filter?)` - query a database with optional filter
- `createPage(parentId, properties, content)` - create a new page
- `updatePageProperties(pageId, properties)` - update page properties

### crawler.ts

Full workspace crawl:

1. Get all top-level pages and databases
2. Recursively traverse child pages
3. For each page, extract all blocks and convert to plain text
4. Store metadata (title, URL, last edited time, parent, tags/properties)
5. Respect rate limits with exponential backoff
6. Report progress (X/Y pages crawled)
7. Cache results to JSON so re-indexing only processes changed pages (compare last_edited_time)

### markdown.ts

Convert Notion block arrays to clean markdown text for embedding. Handle:

- Headings (h1, h2, h3)
- Paragraphs with rich text (bold, italic, code, links)
- Bulleted and numbered lists
- Code blocks with language
- Toggle blocks (include content)
- Callout blocks
- Quote blocks
- Table blocks
- Skip image/video/embed blocks (not embeddable as text)

Also implement markdown-to-Notion-blocks for page creation.

---

## Component 3: RAG Pipeline (src/embeddings/ and src/agent/)

### chunker.ts

Split page content into chunks for embedding:

- Split on heading boundaries (each section becomes a chunk)
- If a section exceeds 500 tokens, split on paragraph boundaries
- Each chunk retains metadata: page ID, page title, section heading, chunk index
- Overlap: include the heading of the previous section as context prefix
- Target chunk size: 300-500 tokens

### embedder.ts

Generate embeddings using OpenAI's text-embedding-3-small (1536 dimensions, cheapest option):

- Batch embed chunks (max 2048 per batch per OpenAI limits)
- Cache embeddings to avoid re-computing on re-index
- Track token usage for cost transparency
- Support a fallback where if no OpenAI key is provided, use a simple TF-IDF based similarity instead (so the project works without any API key for demo purposes)

### store.ts

In-memory vector store with JSON persistence:

- Store: { id, pageId, pageTitle, sectionHeading, text, embedding, lastEdited }
- Search: cosine similarity between query embedding and all stored embeddings
- Return top-k results sorted by similarity with score
- Save/load from a JSON file (data/index.json)
- Support incremental updates (add/remove chunks by pageId)
- The store should be fast enough for workspaces up to ~10,000 chunks (which covers most personal and small team workspaces)

### rag.ts

The core RAG function:

1. Embed the query
2. Retrieve top-k chunks from the store (default k=5)
3. De-duplicate by page (max 2 chunks per page)
4. Build a prompt with retrieved context and the user's question
5. Call OpenAI (gpt-4o-mini) or Anthropic (claude-sonnet-4-6) to generate an answer
6. Parse the answer and attach source page links
7. Return { answer, sources: [{ pageTitle, pageUrl, relevanceScore, snippet }] }

System prompt for the RAG generation:
"You are a helpful assistant answering questions about a Notion workspace. Use ONLY the provided context to answer. If the context doesn't contain enough information, say so. Always cite which pages your answer comes from."

### tagger.ts

Auto-tag untagged pages:

1. Find pages in a database that have an empty "Tags" multi-select property
2. For each untagged page, embed its content
3. Find the 5 most similar already-tagged pages
4. Extract the tag distribution from those pages
5. Suggest tags that appear in 2+ of the similar pages
6. Return suggestions with confidence (fraction of similar pages with that tag)

### summarizer.ts

Weekly digest generator:

1. Query all pages modified in the last 7 days
2. Group by parent database or parent page
3. For each group, concatenate the page titles and first 200 words
4. Call LLM to summarize each group into 2-3 bullet points
5. Compile into a structured digest with sections per group

### creator.ts

Create structured pages from natural language:

1. Parse a natural language request like "Create a meeting notes page for the Q3 planning review with sections for attendees, decisions, and action items"
2. Call LLM to generate a structured markdown document
3. Convert markdown to Notion blocks
4. Create the page in the specified database or parent page
5. Return the new page URL

---

## Component 4: CLI (src/cli/)

A CLI interface using Commander.js:

```bash
# Index your workspace (run once, then incrementally)
npx notionflow index

# Ask a question
npx notionflow ask "What was decided about the pricing model?"

# Suggest tags for untagged pages in a database
npx notionflow tag <database-id>

# Generate a weekly digest
npx notionflow digest

# Create a page from natural language
npx notionflow create "Meeting notes for design review, sections for feedback and next steps"

# Show index stats
npx notionflow stats
```

Each command should print clean, readable output. Use chalk for colors. Show sources with clickable Notion URLs.

---

## Component 5: React Web Dashboard (src/web/)

A single-page React app served by Express:

### Layout

- Left sidebar: "Index Stats" (pages indexed, chunks, last indexed time) + "Recent Searches"
- Main area: Chat interface
- Chat input at bottom with "Ask" button
- Messages appear as cards with the answer and collapsible source pages

### Chat.tsx

- Text input with send button
- Displays conversation history
- Each response shows the answer text plus a "Sources" accordion that lists page titles with links and relevance scores
- Loading state with streaming-style dots

### TagSuggestions.tsx

- Select a database from a dropdown
- Shows untagged pages with suggested tags and confidence
- "Apply" button to apply tags via the Notion API

### Summary.tsx

- "Generate Digest" button
- Displays the structured weekly summary
- Option to "Save to Notion" which creates a new page with the digest

### Styling

- Use Tailwind CSS
- Match Notion's aesthetic: clean, minimal, lots of whitespace
- Use a sans-serif font (Inter or system font stack)
- Light mode only (match Notion's default)

---

## Server (server/)

Express server that serves the React app and provides API endpoints:

```
GET  /api/stats           - Index statistics
POST /api/search          - RAG search { query, maxResults? }
POST /api/tag             - Get tag suggestions { databaseId }
POST /api/tag/apply       - Apply tags { pageId, tags[] }
POST /api/digest          - Generate weekly digest
POST /api/create          - Create page { prompt, parentId? }
GET  /api/databases       - List all databases (for dropdowns)
POST /api/index           - Trigger re-indexing
```

Run with `npx notionflow serve` which starts the Express server and opens the browser.

---

## Tests

### chunker.test.ts

- Test that headings create chunk boundaries
- Test that long sections are split on paragraphs
- Test that chunk metadata is preserved
- Test overlap behavior

### store.test.ts

- Test add/search/remove operations
- Test that cosine similarity returns correct ordering for known vectors
- Test JSON persistence (save and reload)
- Test deduplication by page

### rag.test.ts

- Test with mocked embeddings and LLM responses
- Test that sources are correctly attached
- Test that the "not enough context" case is handled

---

## README.md Content

Title: NotionFlow

Subtitle: AI Knowledge Agent for Notion Workspaces

Description (2-3 sentences): NotionFlow turns your Notion workspace into a searchable knowledge base using RAG. It ships a Notion Worker with agent tools that Custom Agents can call, plus a standalone CLI and React dashboard for semantic search, auto-tagging, weekly digests, and natural language page creation. Built on Notion's Developer Platform (May 2026) using TypeScript, the Notion SDK, and OpenAI embeddings.

### Sections:

**Demo** - GIF or screenshot of the chat interface answering a question with source pages

**Notion Worker** - Explain the three agent tools and how to deploy them. Include the `ntn workers exec --local` commands for testing.

**How It Works** - Diagram or explanation of the RAG pipeline (crawl, chunk, embed, store, retrieve, generate)

**Quick Start**

```bash
git clone https://github.com/Sanjith-Shan/NotionFlow
cd NotionFlow
cp .env.example .env
# Add your NOTION_API_TOKEN and OPENAI_API_KEY to .env
npm install
npx notionflow index     # Index your workspace
npx notionflow serve     # Open the web dashboard
```

**CLI Commands** - Table of all commands with descriptions

**Architecture** - Brief description of each component

**Built On** - Mention Notion Developer Platform, Workers, Notion API, Markdown API. Link to Notion's developer docs.

---

## Environment Variables (.env.example)

```
NOTION_API_TOKEN=        # Notion integration token (create at notion.so/my-integrations)
OPENAI_API_KEY=          # OpenAI API key for embeddings and generation (optional, TF-IDF fallback available)
PORT=3000                # Web dashboard port
```

---

## Important Implementation Notes

- The Notion API has a rate limit of 3 requests per second. The crawler MUST respect this with a delay between requests. Use a simple sleep(350) between calls.
- Notion's API returns blocks, not pages as flat text. The crawler must recursively fetch child blocks for each page. This means indexing 100 pages might take 300+ API calls.
- The vector store is intentionally simple (in-memory + JSON file). Do NOT use a database like Pinecone or Weaviate. The simplicity is the point. It keeps the project self-contained.
- The Notion Worker component may not be deployable without a Business plan. That's fine. Include the code, document how to deploy it, and show local execution. The hiring manager will read the code, not deploy it.
- Make sure the TF-IDF fallback works so the project runs without any paid API keys. This means someone at Notion can clone it, add just their NOTION_API_TOKEN, and see it work.
- All Notion page URLs should be constructed as `https://notion.so/{page_id_without_hyphens}`
- Use the Notion Markdown API (read pages as markdown) where available for simpler content extraction.

---

## Definition of Done

1. `npx notionflow index` successfully crawls a test workspace and builds a vector index
2. `npx notionflow ask "test question"` returns a relevant answer with sources
3. `npx notionflow tag <db-id>` returns tag suggestions for untagged pages
4. `npx notionflow digest` generates a structured weekly summary
5. `npx notionflow serve` opens a React dashboard where you can chat with your workspace
6. The Worker code in worker/ is valid and runs with `ntn workers exec --local`
7. All tests pass
8. The TF-IDF fallback works without an OpenAI key
9. README has clear setup instructions and explains the architecture
10. .gitignore covers node_modules, .env, data/index.json, dist/
