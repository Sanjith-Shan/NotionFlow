// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { Chat } from "../../src/web/components/Chat";

describe("Chat", () => {
  beforeEach(() => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ answer: "The answer is 42.", sources: [], usedModel: "extractive" }),
    })) as unknown as typeof fetch;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("sends a question and renders the answer", async () => {
    render(<Chat />);
    fireEvent.change(screen.getByPlaceholderText(/ask your workspace/i), {
      target: { value: "what is the answer" },
    });
    fireEvent.click(screen.getByRole("button", { name: /ask/i }));

    await waitFor(() => expect(screen.getByText("The answer is 42.")).toBeTruthy());
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/search",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("calls the onAsked callback", async () => {
    const onAsked = vi.fn();
    render(<Chat onAsked={onAsked} />);
    fireEvent.change(screen.getByPlaceholderText(/ask your workspace/i), {
      target: { value: "hello" },
    });
    fireEvent.click(screen.getByRole("button", { name: /ask/i }));
    await waitFor(() => expect(onAsked).toHaveBeenCalledWith("hello"));
  });
});
