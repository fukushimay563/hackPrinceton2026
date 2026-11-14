"use client";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, BookOpen, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { useApp, type ChatMessage } from "@/lib/store";
import { askTutorQuestion } from "@/lib/tutor/ask";
import { SUGGESTED_QUESTIONS } from "@/lib/demo/maya";
import { cn } from "./ui";
import { IS_STATIC } from "@/lib/runtime";

// Internal source links (e.g. /methodology) become hash routes in the single-file build.
const hrefFor = (url: string) => (IS_STATIC && url.startsWith("/") ? `#${url.slice(1)}` : url);

function renderWithCitations(text: string, sources: ChatMessage["sources"]): ReactNode[] {
  return text.split(/(\[\d+\])/g).map((part, i) => {
    const m = part.match(/^\[(\d+)\]$/);
    if (m && sources) {
      const s = sources[Number(m[1]) - 1];
      if (s)
        return (
          <a
            key={i}
            href={hrefFor(s.url)}
            target={s.url.startsWith("http") ? "_blank" : undefined}
            rel="noreferrer"
            title={s.title}
            className="mx-0.5 inline-grid h-4 min-w-4 place-items-center rounded bg-brand-soft px-1 align-super text-[10px] font-bold text-brand-2 no-underline hover:bg-mint"
          >
            {m[1]}
          </a>
        );
    }
    return <span key={i}>{part}</span>;
  });
}

export function TutorChat({ compact = false }: { compact?: boolean }) {
  const path = usePathname();
  const { chat, clearChat, tutorLoading: loading, tutorError: error } = useApp();
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat.length, loading]);

  function ask(question: string) {
    if (!question.trim() || loading) return;
    setInput("");
    askTutorQuestion(question, path);
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", !compact && "h-[70vh] rounded-2xl border border-line bg-white")}>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
        {chat.length === 0 && (
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Sparkles size={16} className="text-brand" /> Hi, I&apos;m FinPilot
            </div>
            <p className="mt-1 text-sm text-ink-2">
              Ask about money, taxes, or how to use FirstFunds. I use your numbers when you&apos;ve shared them, and cite IRS and CFPB sources.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => ask(q)}
                  className="rounded-xl border border-line bg-paper px-3 py-2 text-left text-sm text-ink-2 transition-colors hover:border-brand hover:text-ink"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {chat.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-ink px-4 py-2.5 text-sm text-white">
              {m.content}
            </div>
          ) : (
            <div key={i} className="max-w-[95%]">
              <div className="rounded-2xl rounded-bl-sm border border-line bg-paper px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-ink">
                {renderWithCitations(m.content, m.sources)}
              </div>
              {m.sources && m.sources.length > 0 && (
                <div className="mt-2 space-y-1 pl-1">
                  <div className="flex items-center gap-1 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
                    <BookOpen size={12} /> Sources
                    {m.mode === "offline" && <span className="ml-1 normal-case">· offline mode</span>}
                  </div>
                  {m.sources.map((s, j) => (
                    <a
                      key={j}
                      href={hrefFor(s.url)}
                      target={s.url.startsWith("http") ? "_blank" : undefined}
                      rel="noreferrer"
                      className="block truncate text-xs text-info hover:underline"
                    >
                      [{j + 1}] {s.title}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ),
        )}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-ink-3">
            <Loader2 size={16} className="animate-spin" /> Checking your numbers and sources…
          </div>
        )}
        {error && (
          <div role="alert" className="rounded-xl bg-debt-soft px-3 py-2 text-sm text-debt">
            {error}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="border-t border-line p-3"
      >
        <div className="flex items-end gap-2 rounded-xl border border-line bg-white p-1.5 focus-within:border-brand">
          <label htmlFor="tutor-input" className="sr-only">
            Ask the tutor
          </label>
          <textarea
            id="tutor-input"
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(input);
              }
            }}
            placeholder="e.g. Why is my refund this size?"
            className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
          />
          {chat.length > 0 && (
            <button type="button" onClick={clearChat} aria-label="Clear chat" className="rounded-lg p-2 text-ink-3 hover:bg-black/5">
              <RotateCcw size={16} />
            </button>
          )}
          <button
            type="submit"
            disabled={!input.trim() || loading}
            aria-label="Send"
            className="rounded-lg bg-ink p-2 text-white disabled:opacity-40"
          >
            <ArrowUp size={16} />
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-ink-3">Education, not financial or tax advice. Don&apos;t share SSNs or account numbers.</p>
      </form>
    </div>
  );
}
