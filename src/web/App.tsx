import { useEffect, useState } from "react";
import { api, type Stats } from "./api";
import { Chat } from "./components/Chat";
import { TagSuggestions } from "./components/TagSuggestions";
import { Summary } from "./components/Summary";

type Tab = "chat" | "tags" | "digest";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "chat", label: "Chat" },
  { id: "tags", label: "Tags" },
  { id: "digest", label: "Digest" },
];

function Sidebar({ stats, recent }: { stats: Stats | null; recent: string[] }) {
  return (
    <aside className="flex w-72 flex-col gap-6 border-r border-gray-100 p-5">
      <div>
        <h1 className="text-lg font-semibold">NotionFlow</h1>
        <p className="text-sm text-subtle">AI knowledge agent</p>
      </div>

      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">
          Index stats
        </h2>
        {stats ? (
          <dl className="space-y-1 text-sm">
            <Row label="Pages" value={String(stats.pages)} />
            <Row label="Chunks" value={String(stats.chunks)} />
            <Row label="Embedder" value={stats.embedderMode} />
            <Row label="Answers" value={stats.provider} />
            <Row label="Source" value={stats.source} />
          </dl>
        ) : (
          <p className="text-sm text-subtle">Loading...</p>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">
          Recent searches
        </h2>
        {recent.length === 0 ? (
          <p className="text-sm text-subtle">None yet</p>
        ) : (
          <ul className="space-y-1 text-sm text-subtle">
            {recent.map((q, i) => (
              <li key={i} className="truncate">
                {q}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-subtle">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

export function App() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>("chat");

  useEffect(() => {
    api
      .stats()
      .then(setStats)
      .catch(() => undefined);
  }, []);

  function recordSearch(question: string) {
    setRecent((r) => [question, ...r].slice(0, 8));
  }

  return (
    <div className="flex h-screen font-sans">
      <Sidebar stats={stats} recent={recent} />
      <main className="flex flex-1 flex-col">
        <nav className="flex gap-1 border-b border-gray-100 px-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={
                tab === t.id
                  ? "border-b-2 border-ink px-4 py-3 font-medium"
                  : "border-b-2 border-transparent px-4 py-3 text-subtle hover:text-ink"
              }
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="flex-1 overflow-hidden">
          {tab === "chat" && <Chat onAsked={recordSearch} />}
          {tab === "tags" && <TagSuggestions />}
          {tab === "digest" && <Summary />}
        </div>
      </main>
    </div>
  );
}
