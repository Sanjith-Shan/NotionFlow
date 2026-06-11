#!/usr/bin/env node
// Thin executable wrapper so the CLI can run as `notionflow <command>` after an
// `npm link` or via `npx`. It registers tsx so the TypeScript entry point runs
// directly without a separate build step. For day to day use prefer the npm
// script `npm run cli -- <command>`.
import { register } from "tsx/esm/api";
import { fileURLToPath } from "node:url";

register();
await import(fileURLToPath(new URL("../src/cli/index.ts", import.meta.url)));
