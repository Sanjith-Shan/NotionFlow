import { useState } from "react";
import type { Source } from "../api";

// A collapsible list of the pages a RAG answer was drawn from, with relevance
// scores and snippets.
export function SearchResults({ sources }: { sources: Source[] }) {
  const [open, setOpen] = useState(false);
  if (sources.length === 0) return null;

  return (
    <div className="mt-3 border-t border-gray-100 pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-sm text-subtle hover:text-ink"
      >
        {open ? "Hide" : "Show"} {sources.length} source{sources.length === 1 ? "" : "s"}
      </button>
      {open && (
        <ul className="mt-2 space-y-2">
          {sources.map((source) => (
            <li key={source.pageId} className="rounded-md bg-gray-50 p-2">
              <div className="flex items-center justify-between">
                <a
                  href={source.pageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-ink hover:underline"
                >
                  {source.pageTitle}
                </a>
                <span className="text-xs text-subtle">{source.relevanceScore.toFixed(3)}</span>
              </div>
              <p className="mt-1 text-sm text-subtle">{source.snippet}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
