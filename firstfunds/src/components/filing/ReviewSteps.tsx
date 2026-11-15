"use client";
import { useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Copy, Download, ExternalLink, FileText, Pencil, Plus, Sparkles } from "lucide-react";
import type { StepResult } from "@/lib/minimizer/graph";
import type { QuestionState } from "@/lib/minimizer/engine";
import type { DocFields, FilingEvent, SourceRef } from "@/lib/minimizer/types";
import { downloadWorksheet } from "@/lib/pdf/worksheet";
import { IS_STATIC } from "@/lib/runtime";
import { cn } from "@/components/ui";
import { answerLabel, AssistantLine } from "./QuestionCard";
import { ConfirmDoc, DocSummary } from "./DocumentsStep";

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function AnswerList({ res, onChange }: { res: StepResult; onChange: (id: string) => void }) {
  const qs = res.analysis.questions.filter((q) => q.status !== "unanswered");
  if (!qs.length) return null;
  return (
    <section className="mt-6">
      <h3 className="text-sm font-semibold tracking-wide text-ink-3 uppercase">Your answers</h3>
      <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-card">
        {qs.map((q: QuestionState) => (
          <li key={q.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <div className="text-sm text-ink-2">{q.text}</div>
              <div className={cn("mt-0.5 font-semibold", (q.status === "not_sure" || q.status === "skipped") && "text-warn")}>
                {answerLabel(q, res.profile.answers[q.id]?.value)}
              </div>
            </div>
            <button onClick={() => onChange(q.id)} className="shrink-0 rounded-lg px-3 py-2 text-sm font-semibold text-info hover:bg-info-soft">
              Change
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Notices({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="mt-4 space-y-2">
      {items.map((n) => (
        <li key={n} className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-ink">
          {n}
        </li>
      ))}
    </ul>
  );
}

export function VerifyStep({ res, send, onChange }: { res: StepResult; send: (e: FilingEvent, busy?: string) => void; onChange: (id: string) => void }) {
  const a = res.analysis;
  const [fixing, setFixing] = useState<string | null>(null);
  const w2s = a.docs.filter((d) => d.kind === "W-2");
  const fixDoc = fixing ? res.profile.documents.find((d) => d.id === fixing) : null;

  if (fixDoc)
    return (
      <ConfirmDoc
        doc={fixDoc}
        index={1}
        total={1}
        onConfirm={(fields?: DocFields) => {
          setFixing(null);
          send({ type: "confirmDocument", docId: fixDoc.id, fields });
        }}
      />
    );

  return (
    <div>
      <AssistantLine text={a.assistant} />
      <h2 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Check everything before we calculate</h2>

      {a.blockers.length > 0 && (
        <div className="mt-5 rounded-2xl border border-warn/30 bg-warn-soft p-4">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle size={18} className="text-warn" /> Before we can calculate
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {a.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          {a.blockers.some((b) => /dependent/.test(b)) && (
            <p className="mt-2 text-sm text-ink-2">
              Not sure about dependents? Generally, parents can claim a child who is under 19, or under 24 and a full-time student, who lived
              with them for more than half the year and didn&apos;t pay for more than half of their own support. Ask your parents, or see{" "}
              <a className="font-semibold underline" href="https://www.irs.gov/publications/p501" target="_blank" rel="noreferrer">
                IRS Publication 501
              </a>
              .
            </p>
          )}
        </div>
      )}

      <section className="mt-6">
        <h3 className="text-sm font-semibold tracking-wide text-ink-3 uppercase">Your income</h3>
        <ul className="mt-2 space-y-2">
          {w2s.map((d) => (
            <li key={d.id} className="flex items-start justify-between gap-3 rounded-2xl border border-line bg-card p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-semibold">
                  <FileText size={16} className="text-brand" /> {d.label}
                </div>
                <div className="num mt-1 text-sm text-ink-2">
                  <DocSummary d={d} />
                </div>
                {d.correctedFields.length > 0 && <div className="mt-1 text-xs text-ink-3">Includes numbers you corrected</div>}
              </div>
              <button onClick={() => setFixing(d.id)} aria-label={`Fix ${d.label}`} className="rounded-lg p-2 text-info hover:bg-info-soft">
                <Pencil size={16} />
              </button>
            </li>
          ))}
        </ul>
        <button
          onClick={() => send({ type: "uploadsDone", done: false })}
          className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-info hover:underline"
        >
          <Plus size={14} /> Add another document
        </button>
      </section>

      <Notices items={a.notices} />
      <AnswerList res={res} onChange={onChange} />

      <button
        disabled={!a.readyForReview}
        onClick={() => send({ type: "verify", verified: true }, "Calculating your estimate…")}
        className="sticky bottom-4 mt-8 w-full min-h-14 rounded-md bg-accent text-base font-semibold text-on-accent shadow-lg hover:bg-brand-2 disabled:opacity-40 disabled:shadow-none"
      >
        Everything&apos;s right. Calculate my estimate
      </button>
    </div>
  );
}

function SourceChip({ s }: { s: SourceRef }) {
  const text = s.kind === "document" ? `${s.docLabel}, ${s.box}${s.userCorrected ? " (you corrected)" : ""}` : s.label;
  return <span className="inline-block rounded-md bg-paper px-2 py-0.5 text-[11px] text-ink-2">{text}</span>;
}

export function EstimateStep({ res, send }: { res: StepResult; send: (e: FilingEvent, busy?: string) => void }) {
  const c = res.analysis.calc!;
  const d = res.draft;
  const refund = c.refund >= 0;
  return (
    <div>
      <AssistantLine text="Your tax estimate is ready." />
      <div className={cn("rounded-3xl p-6 text-center", refund ? "bg-brand-soft" : "bg-debt-soft")}>
        <div className={cn("text-sm font-semibold", refund ? "text-brand-2" : "text-debt")}>
          {refund ? "Estimated federal refund" : "Estimated amount you owe"}
        </div>
        <div className={cn("num mt-1 text-5xl font-semibold tracking-tight", refund ? "text-brand-2" : "text-debt")}>{usd(Math.abs(c.refund))}</div>
        <p className="mt-2 text-sm text-ink-2">2025 federal return · single · W-2 income only</p>
      </div>

      {d && (
        <ol className="mt-5 divide-y divide-line rounded-2xl border border-line bg-card">
          {d.lines.map((l) => (
            <li key={l.label} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-ink-2">{l.label}</span>
                <span className="num font-semibold">{usd(l.amount)}</span>
              </div>
              {(l.sources.length > 0 || l.rule) && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {l.sources.map((s, i) => (
                    <SourceChip key={i} s={s} />
                  ))}
                  {l.rule && (
                    <a href={l.rule.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 rounded-md bg-info-soft px-2 py-0.5 text-[11px] font-medium text-info">
                      {l.rule.label} <ExternalLink size={10} />
                    </a>
                  )}
                </div>
              )}
            </li>
          ))}
          <li className="flex items-center justify-between px-4 py-3">
            <span className="font-semibold">{refund ? "Refund" : "Amount owed"}</span>
            <span className={cn("num text-lg font-semibold", refund ? "text-brand" : "text-debt")}>{usd(Math.abs(c.refund))}</span>
          </li>
        </ol>
      )}

      <p className="mt-4 text-sm text-ink-2">
        Approving confirms you&apos;ve checked these numbers. It doesn&apos;t file anything. You&apos;ll file through IRS Free File or another
        provider.
      </p>
      <div className="mt-4 space-y-3">
        <button onClick={() => send({ type: "approve" })} className="w-full min-h-14 rounded-md bg-accent text-base font-semibold text-on-accent">
          <span className="inline-flex items-center gap-2">
            <Check size={18} /> Approve this draft
          </span>
        </button>
        <button onClick={() => send({ type: "verify", verified: false })} className="w-full min-h-14 rounded-2xl border-2 border-line bg-card text-base font-semibold">
          Go back and change something
        </button>
      </div>
    </div>
  );
}

export function ApprovedStep({ res, onAskTutor, onRestart }: { res: StepResult; onAskTutor: () => void; onRestart: () => void }) {
  const c = res.analysis.calc!;
  const [copied, setCopied] = useState(false);
  const summary = [
    "FirstFunds draft, 2025 federal return (estimate, not filed)",
    ...res.draft!.lines.map((l) => `${l.label}: ${usd(l.amount)}`),
    `${c.refund >= 0 ? "Estimated refund" : "Estimated amount owed"}: ${usd(Math.abs(c.refund))}`,
  ].join("\n");
  return (
    <div className="text-center">
      <CheckCircle2 size={56} className="mx-auto text-brand" />
      <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-[28px]">Your draft return is approved</h2>
      <p className="mt-2 text-ink-2">
        {c.refund >= 0 ? `Estimated refund: ${usd(c.refund)}.` : `Estimated amount owed: ${usd(-c.refund)}.`} Next, file it with a trusted
        provider. FirstFunds doesn&apos;t file returns.
      </p>
      <div className="mt-6 space-y-3 text-left">
        <a
          href="https://www.irs.gov/filing/irs-free-file-do-your-taxes-for-free"
          target="_blank"
          rel="noreferrer"
          className="flex w-full min-h-14 items-center justify-center gap-2 rounded-md bg-accent text-base font-semibold text-on-accent hover:bg-brand-2"
        >
          File free with IRS Free File <ExternalLink size={16} />
        </a>
        {!IS_STATIC && (
          <button
            onClick={() =>
              downloadWorksheet(
                {
                  filingStatus: "single",
                  wages: c.grossIncome,
                  federalWithheld: c.withholding,
                  canBeClaimedAsDependent: res.profile.answers["dependent.claimable"]?.value === "yes",
                  hasTipsOrOvertime: false,
                  hasOtherIncome: false,
                  isStudent: false,
                },
                c,
                "",
              )
            }
            className="flex w-full min-h-14 items-center justify-center gap-2 rounded-2xl border-2 border-line bg-card text-base font-semibold"
          >
            <Download size={18} /> Download review worksheet (PDF)
          </button>
        )}
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(summary);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
          className="flex w-full min-h-14 items-center justify-center gap-2 rounded-2xl border-2 border-line bg-card text-base font-semibold"
        >
          <Copy size={18} /> {copied ? "Copied" : "Copy a summary"}
        </button>
        <button onClick={onAskTutor} className="flex w-full min-h-14 items-center justify-center gap-2 rounded-2xl border-2 border-line bg-card text-base font-semibold">
          <Sparkles size={18} className="text-brand" /> Ask FinPilot about my return
        </button>
      </div>
      <button onClick={onRestart} className="mt-6 text-sm font-medium text-ink-3 hover:text-ink">
        Start a new return
      </button>
    </div>
  );
}

export function UnsupportedStep({ res, onChange, onRestart }: { res: StepResult; onChange: (id: string) => void; onRestart: () => void }) {
  return (
    <div>
      <AssistantLine text="Thanks for telling us. This return needs things we can't handle safely yet." />
      <h2 className="text-2xl font-semibold tracking-tight sm:text-[28px]">We can&apos;t prepare this return accurately</h2>
      <p className="mt-2 text-ink-2">Rather than give you a wrong number, here&apos;s what needs a different tool or a professional:</p>
      <ul className="mt-5 space-y-3">
        {res.analysis.scope.reasons.map((r) => (
          <li key={r.id} className="rounded-2xl border border-line bg-card p-4">
            <div className="font-semibold">{r.title}</div>
            <p className="mt-1 text-sm text-ink-2">{r.detail}</p>
            {r.link && (
              <a href={r.link.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-info">
                {r.link.label} <ExternalLink size={12} />
              </a>
            )}
          </li>
        ))}
      </ul>
      <a
        href="https://www.irs.gov/filing/irs-free-file-do-your-taxes-for-free"
        target="_blank"
        rel="noreferrer"
        className="mt-5 flex w-full min-h-14 items-center justify-center gap-2 rounded-md bg-accent text-base font-semibold text-on-accent"
      >
        See IRS Free File options <ExternalLink size={16} />
      </a>
      <AnswerList res={res} onChange={onChange} />
      <button onClick={onRestart} className="mt-6 w-full text-center text-sm font-medium text-ink-3 hover:text-ink">
        Start over
      </button>
    </div>
  );
}
