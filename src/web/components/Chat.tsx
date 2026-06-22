import { useState } from "react";
import { api, type Source } from "../api";
import { SearchResults } from "./SearchResults";

interface Message {
  role: "user" | "assistant";
  text: string;
  sources?: Source[];
  model?: string;
}

function LoadingDots() {
  return (
    <span aria-label="loading">
      <span className="dot">.</span>
      <span className="dot">.</span>
      <span className="dot">.</span>
    </span>
  );
}

// The main chat surface. Asks the workspace a question and renders the answer
// with a collapsible list of source pages.
export function Chat({ onAsked }: { onAsked?: (question: string) => void }) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask() {
    const question = input.trim();
    if (!question || loading) return;
    setInput("");
    setError(null);
    setMessages((m) => [...m, { role: "user", text: question }]);
    setLoading(true);
    onAsked?.(question);
    try {
      const result = await api.search(question);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: result.answer,
          sources: result.sources,
          model: result.usedModel,
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        {messages.length === 0 && (
          <p className="text-subtle">
            Ask anything about the workspace. Try &ldquo;What did we decide about pricing?&rdquo;
          </p>
        )}
        {messages.map((message, i) => (
          <div
            key={i}
            className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
          >
            <div
              className={
                message.role === "user"
                  ? "max-w-2xl rounded-2xl bg-ink px-4 py-2 text-white"
                  : "max-w-2xl rounded-2xl bg-gray-50 px-4 py-3"
              }
            >
              <p className="whitespace-pre-wrap">{message.text}</p>
              {message.role === "assistant" && message.sources && (
                <SearchResults sources={message.sources} />
              )}
              {message.model && (
                <p className="mt-2 text-xs text-subtle">answered by {message.model}</p>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-gray-50 px-4 py-3 text-subtle">
              <LoadingDots />
            </div>
          </div>
        )}
        {error && <p className="text-red-500">{error}</p>}
      </div>

      <div className="border-t border-gray-100 p-4">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") ask();
            }}
            placeholder="Ask your workspace..."
            className="flex-1 rounded-lg border border-gray-200 px-4 py-2 outline-none focus:border-ink"
          />
          <button
            type="button"
            onClick={ask}
            disabled={loading}
            className="rounded-lg bg-ink px-5 py-2 text-white disabled:opacity-50"
          >
            Ask
          </button>
        </div>
      </div>
    </div>
  );
}
