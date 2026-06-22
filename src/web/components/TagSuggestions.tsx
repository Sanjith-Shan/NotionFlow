import { useEffect, useState } from "react";
import { api, type Database, type PageTagSuggestions } from "../api";

// Suggests tags for untagged pages in a selected database and lets the user
// apply them. Applying requires a Notion token on the server.
export function TagSuggestions() {
  const [databases, setDatabases] = useState<Database[]>([]);
  const [selected, setSelected] = useState("");
  const [suggestions, setSuggestions] = useState<PageTagSuggestions[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api
      .databases()
      .then((dbs) => {
        setDatabases(dbs);
        if (dbs[0]) setSelected(dbs[0].id);
      })
      .catch((e) => setNotice(e instanceof Error ? e.message : "Failed to load databases"));
  }, []);

  async function run() {
    if (!selected) return;
    setLoading(true);
    setNotice(null);
    try {
      setSuggestions(await api.tag(selected));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Failed to get suggestions");
    } finally {
      setLoading(false);
    }
  }

  async function apply(pageId: string, tags: string[]) {
    try {
      await api.applyTags(pageId, tags);
      setNotice("Applied tags.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Failed to apply tags");
    }
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center gap-2">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2"
        >
          {databases.map((db) => (
            <option key={db.id} value={db.id}>
              {db.title}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={run}
          disabled={loading || !selected}
          className="rounded-lg bg-ink px-4 py-2 text-white disabled:opacity-50"
        >
          Suggest tags
        </button>
      </div>

      {notice && <p className="text-sm text-subtle">{notice}</p>}

      <ul className="space-y-3">
        {suggestions.map((page) => (
          <li key={page.pageId} className="rounded-lg border border-gray-100 p-3">
            <div className="flex items-center justify-between">
              <span className="font-medium">{page.pageTitle}</span>
              <button
                type="button"
                onClick={() =>
                  apply(
                    page.pageId,
                    page.suggestions.map((s) => s.tag),
                  )
                }
                className="text-sm text-subtle hover:text-ink"
              >
                Apply all
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {page.suggestions.map((s) => (
                <span key={s.tag} className="rounded-full bg-gray-100 px-3 py-1 text-sm">
                  {s.tag}
                  <span className="ml-1 text-subtle">{Math.round(s.confidence * 100)}%</span>
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {!loading && suggestions.length === 0 && (
        <p className="text-subtle">Pick a database and suggest tags for its untagged pages.</p>
      )}
    </div>
  );
}
