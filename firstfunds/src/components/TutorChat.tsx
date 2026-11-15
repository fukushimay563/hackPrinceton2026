"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import { messageVariants, SPRING, staggerParent, fadeUp } from "@/lib/motion";
import { ArrowDown, ArrowRight, ArrowUp, BookOpen, Calculator, ExternalLink, FileUp, Loader2, MessageCircle, Paperclip, RotateCcw, Sparkles } from "lucide-react";
import { useApp, type ChatMessage } from "@/lib/store";
import { askTutorQuestion } from "@/lib/tutor/ask";
import { cn } from "./ui";
import { IS_STATIC } from "@/lib/runtime";

// Internal source links (e.g. /methodology) become hash routes in the single-file build.
const hrefFor = (url: string) => (IS_STATIC && url.startsWith("/") ? `#${url.slice(1)}` : url);
const host = (url: string) => {
  if (url.startsWith("/")) return "FirstFunds";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const STARTERS = ["Can you estimate my taxes?", "What documents do I need?", "Can you help me understand my W-2?"];

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

/** Next steps suggested from what the user asked: links into the real workflows, never invented results. */
function nextSteps(question: string | undefined, hasTax: boolean): { href: string; label: string; icon: typeof FileUp; note?: string }[] {
  if (!question) return [];
  const q = question.toLowerCase();
  const out: { href: string; label: string; icon: typeof FileUp; note?: string }[] = [];
  if (/estimate|refund|owe|tax bill/.test(q) && !hasTax)
    out.push({ href: "/taxes", label: "Start my tax estimate", icon: ArrowRight, note: "I don't have your income yet. Add a W-2 for a personal estimate." });
  if (/w-?2|document|upload|form/.test(q)) out.push({ href: "/taxes", label: "Upload a W-2", icon: FileUp });
  if (/budget|spend|spending|transaction/.test(q)) out.push({ href: "/budget", label: "Open My Budget", icon: ArrowRight });
  return out;
}

export function TutorChat({ compact = false }: { compact?: boolean }) {
  const path = usePathname();
  const { chat, clearChat, tutorLoading: loading, tutorError: error, tax } = useApp();
  const [input, setInput] = useState("");
  const [pinned, setPinned] = useState(true); // true while the user is at the bottom
  const [unseen, setUnseen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const reduce = useReducedMotion();
  const welcome = !compact && chat.length === 0 && !loading;

  // Smart auto-scroll: follow new messages only if the reader is already at the bottom.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (pinned) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    else if (chat.length) queueMicrotask(() => setUnseen(true));
  }, [chat.length, loading, pinned]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [input]);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    setPinned(atBottom);
    if (atBottom) setUnseen(false);
  }

  function focusInput() {
    document.getElementById("tutor-input")?.focus();
  }

  function jumpDown() {
    const el = scroller.current;
    el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setPinned(true);
    setUnseen(false);
  }

  function ask(question: string) {
    if (!question.trim() || loading) return;
    setInput("");
    setPinned(true);
    askTutorQuestion(question, path);
  }

  const hasTax = tax.wages > 0;

  function renderComposer(hero: boolean) {
    return (
      <motion.form
        layoutId="ff-composer"
        transition={SPRING.soft}
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className={hero ? "w-full" : "border-t border-line p-3"}
      >
        <div className="flex items-end gap-1.5 rounded-xl border border-line bg-card p-1.5 transition-colors focus-within:border-brand">
          <Link href="/taxes" aria-label="Upload a tax document" title="Upload a tax document" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-3 hover:bg-ink/5 hover:text-ink">
            <Paperclip size={16} />
          </Link>
          <label htmlFor="tutor-input" className="sr-only">
            Ask FinPilot
          </label>
          <textarea
            ref={inputRef}
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
            placeholder="Ask about taxes, your paycheck or your budget…"
            className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none"
          />
          {chat.length > 0 && (
            <button type="button" onClick={clearChat} aria-label="Clear chat" className="grid h-9 w-9 place-items-center rounded-lg text-ink-3 hover:bg-ink/5">
              <RotateCcw size={16} />
            </button>
          )}
          <motion.button
            type="submit"
            disabled={!input.trim() || loading}
            aria-label={loading ? "Waiting for the answer" : "Send"}
            whileTap={{ scale: 0.9 }}
            className="grid h-9 w-9 place-items-center rounded-md bg-accent text-on-accent transition-colors duration-200 disabled:opacity-40"
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {loading ? (
                <motion.span key="busy" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }}>
                  <Loader2 size={16} className="animate-spin" />
                </motion.span>
              ) : (
                <motion.span key="send" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                  <ArrowUp size={16} />
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
        <p className="mt-1.5 text-[11px] text-ink-3">Education, not financial or tax advice. Don&apos;t share SSNs or account numbers.</p>
      </motion.form>
    );
  }


  return (
    <LayoutGroup>
    <div className={cn("relative flex min-h-0 flex-1 flex-col", !compact && cn("surface rounded-2xl border border-line md:h-[72vh] md:min-h-[480px]", welcome ? "min-h-[420px]" : "h-[calc(100dvh-17rem)] min-h-[420px]"))}>
      {welcome ? (
        <motion.div
          key="welcome"
          className="flex min-h-0 flex-1 flex-col justify-start overflow-y-auto p-5 sm:p-10 md:justify-center"
          variants={staggerParent(0.07, 0.05)}
          initial={reduce ? false : "hidden"}
          animate="show"
        >
          <motion.div variants={fadeUp} className="text-[11px] tracking-[0.05em] text-ink-3 uppercase">FinPilot · AI financial advisor</motion.div>
          <motion.h2 variants={fadeUp} className="mt-3 max-w-xl text-[32px] leading-[1.05] text-ink sm:text-[44px]">Your finances, finally making sense.</motion.h2>
          <motion.p variants={fadeUp} className="mt-3 max-w-xl text-ink-3">
            Understand your taxes, explore your financial options, and get answers with an AI advisor built around you.
          </motion.p>
          <motion.div variants={fadeUp} className="mt-7 max-w-2xl">{renderComposer(true)}</motion.div>
          <motion.div variants={staggerParent(0.06)} className="mt-4 grid max-w-2xl gap-2 sm:grid-cols-3">
            {[
              { label: "Estimate my taxes", body: "Uses your W-2 numbers, or tells you what's missing", icon: Calculator, run: () => ask("Can you estimate my taxes?") },
              { label: "Analyze a document", body: "Upload a W-2 and confirm what we read", icon: FileUp, run: () => router.push("/taxes") },
              { label: "Ask a financial question", body: "Anything about money, credit or taxes", icon: MessageCircle, run: focusInput },
            ].map((a) => (
              <motion.button
                key={a.label}
                type="button"
                variants={fadeUp}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={a.run}
                className="flex flex-col rounded-xl border border-line bg-card p-3 text-left transition-colors duration-200 hover:border-ink-3 sm:p-3.5"
              >
                <a.icon size={17} className="text-ink" />
                <span className="mt-2 text-[15px] text-ink sm:mt-3">{a.label}</span>
                <span className="mt-0.5 text-xs text-ink-3">{a.body}</span>
              </motion.button>
            ))}
          </motion.div>
          <motion.p variants={fadeUp} className="mt-5 text-xs text-ink-3">No account needed. Never share an SSN or account number.</motion.p>
        </motion.div>
      ) : (
      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5" aria-live="polite" aria-busy={loading}>
        {/* Welcome */}
        <div className="flex gap-3">
          <Avatar />
          <div className="max-w-[92%]">
            <div className="rounded-2xl rounded-tl-md border border-line bg-card px-4 py-3 text-sm leading-relaxed text-ink">
              Welcome! I can help you understand your taxes, review financial documents, and explore your financial options. What would you like to work on today?
            </div>
            {chat.length === 0 && (
              <motion.div initial="hidden" animate="show" transition={{ staggerChildren: 0.05, delayChildren: 0.05 }} className="mt-3 grid gap-2 sm:grid-cols-3">
                {STARTERS.map((q) => (
                  <motion.button
                    key={q}
                    variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
                    type="button"
                    onClick={() => ask(q)}
                    className="lift rounded-xl border border-line bg-card px-3 py-2.5 text-left text-sm text-ink"
                  >
                    {q}
                  </motion.button>
                ))}
              </motion.div>
            )}
            {chat.length === 0 && (
              <p className="mt-3 text-xs text-ink-3">
                I use your numbers only after you share them, and cite IRS and CFPB sources. You never need to give me an SSN or account number.
              </p>
            )}
          </div>
        </div>

        <AnimatePresence initial={false}>
          {chat.map((m, i) =>
            m.role === "user" ? (
              <motion.div key={i} variants={messageVariants} initial="hidden" animate="show" className="ml-auto origin-bottom-right max-w-[85%] rounded-2xl rounded-br-md bg-obsidian px-4 py-2.5 text-sm text-paper">
                {m.content}
              </motion.div>
            ) : (
              <motion.div key={i} variants={messageVariants} initial="hidden" animate="show" className="flex origin-top-left gap-3">
                <Avatar />
                <div className="min-w-0 max-w-[92%] flex-1">
                  <div className="rounded-2xl rounded-tl-md border border-line bg-card px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-ink">
                    {renderWithCitations(m.content, m.sources)}
                  </div>
                  {m.mode === "offline" && (
                    <div className="mt-1 pl-1 text-[11px] text-ink-3">
                      Answered offline from FirstFunds&apos; built-in guides.
                      {m.fallbackReason && <span className="text-warn"> Gemini wasn&apos;t used: {m.fallbackReason}</span>}
                    </div>
                  )}
                  {m.mode === "gemini" && <div className="mt-1 pl-1 text-[11px] text-ink-3">Answered by Gemini using your numbers and the sources below.</div>}
                  {m.sources && m.sources.length > 0 && (
                    <div className="mt-2">
                      <div className="mb-1.5 flex items-center gap-1 pl-1 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
                        <BookOpen size={12} /> Sources
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {m.sources.map((s, j) => (
                          <a
                            key={j}
                            href={hrefFor(s.url)}
                            target={s.url.startsWith("http") ? "_blank" : undefined}
                            rel="noreferrer"
                            className="lift flex items-start gap-2 rounded-xl border border-line bg-card p-2.5 text-xs hover:border-brand/40"
                          >
                            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-brand-soft text-[10px] font-bold text-brand-2">{j + 1}</span>
                            <span className="min-w-0">
                              <span className="line-clamp-2 font-medium text-ink">{s.title}</span>
                              <span className="mt-0.5 flex items-center gap-1 text-ink-3">
                                {host(s.url)} {s.url.startsWith("http") && <ExternalLink size={10} />}
                              </span>
                            </span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  {nextSteps(chat[i - 1]?.content, hasTax).map((a) => (
                    <div key={a.label} className="mt-2">
                      {a.note && <p className="mb-1.5 pl-1 text-xs text-ink-2">{a.note}</p>}
                      <Link href={a.href} className="inline-flex items-center gap-1.5 rounded-md border border-brand/40 bg-brand-soft px-3 py-1.5 text-xs font-semibold text-brand-2 transition-transform">
                        <a.icon size={13} /> {a.label}
                      </Link>
                    </div>
                  ))}
                </div>
              </motion.div>
            ),
          )}
        </AnimatePresence>

        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3 text-sm text-ink-3" role="status">
            <Avatar />
            <span className="flex items-center gap-2 rounded-2xl border border-line bg-card px-4 py-3">
              <span className="flex gap-1" aria-hidden>
                {[0, 1, 2].map((d) => (
                  <motion.span key={d} className="h-1.5 w-1.5 rounded-full bg-ink" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: d * 0.15 }} />
                ))}
              </span>
              Checking your numbers and sources…
            </span>
          </motion.div>
        )}
        {error && (
          <div role="alert" className="rounded-xl border border-debt/30 bg-debt-soft px-3 py-2 text-sm text-debt">
            {error}{" "}
            <button type="button" className="font-semibold underline" onClick={() => ask(chat.filter((c) => c.role === "user").at(-1)?.content ?? "")}>
              Try again
            </button>
          </div>
        )}
      </div>
      )}
      <AnimatePresence>
        {unseen && !pinned && (
          <motion.button
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            type="button"
            onClick={jumpDown}
            className="absolute bottom-24 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-md bg-obsidian px-3 py-1.5 text-xs font-semibold text-paper shadow-lg"
          >
            <ArrowDown size={13} /> New message
          </motion.button>
        )}
      </AnimatePresence>

      {!welcome && renderComposer(false)}
    </div>
    </LayoutGroup>
  );
}

function Avatar() {
  return (
    <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-obsidian text-accent">
      <Sparkles size={14} />
    </span>
  );
}
