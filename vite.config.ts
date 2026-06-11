import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The web dashboard is a small single page React app. In development it runs on
// the Vite dev server and proxies API calls to the Express server. In production
// it is built into dist/web and served by the same Express server.
export default defineConfig({
  plugins: [react()],
  root: ".",
  build: {
    outDir: "dist/web",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
