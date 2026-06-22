import { useState } from "react";
import { api, type Digest } from "../api";

// Generates a digest of recent workspace activity and can save it back to Notion
// as a new page.
export function Summary() {
  const [digest, setDigest] = useState<Digest | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setNotice(null);
    try {
      setDigest(await api.digest(7));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Failed to generate digest");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!digest) return;
    const body = digest.groups.map((g) => `## ${g.title}\n${g.summary}`).join("\n\n");
    const prompt = `Create a page titled Weekly Digest with the following content.\n\n${body}`;
    try {
      const created = await api.create(prompt);
      setNotice(
        created.created ? `Saved to ${created.url}` : "Notion token not set. Draft generated only.",
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Failed to save");
    }
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="rounded-lg bg-ink px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? "Generating..." : "Generate digest"}
        </button>
        {digest && (
          <button
            type="button"
            onClick={save}
            className="rounded-lg border border-gray-200 px-4 py-2 hover:border-ink"
          >
            Save to Notion
          </button>
        )}
      </div>

      {notice && <p className="text-sm text-subtle">{notice}</p>}

      {digest && (
        <div className="space-y-4">
          <p className="text-subtle">
            {digest.pageCount} pages edited since {new Date(digest.since).toLocaleDateString()}
          </p>
          {digest.groups.map((group) => (
            <div key={group.title} className="rounded-lg border border-gray-100 p-4">
              <h3 className="font-semibold">{group.title}</h3>
              <p className="mt-1 whitespace-pre-wrap text-ink">{group.summary}</p>
              <ul className="mt-2 space-y-1">
                {group.pages.map((page) => (
                  <li key={page.url}>
                    <a
                      href={page.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-subtle hover:text-ink hover:underline"
                    >
                      {page.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
