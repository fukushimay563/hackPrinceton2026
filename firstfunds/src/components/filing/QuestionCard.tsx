"use client";
import { useState } from "react";
import { ChevronDown, ExternalLink, Sparkles } from "lucide-react";
import { NOT_SURE } from "@/lib/minimizer/registry";
import type { QuestionState } from "@/lib/minimizer/engine";
import type { AnswerValue } from "@/lib/minimizer/types";
import { cn } from "@/components/ui";

export function answerLabel(q: QuestionState, value: AnswerValue | undefined): string {
  if (value === undefined) return q.status === "skipped" ? "Skipped" : "Not answered";
  if (value === NOT_SURE) return "I'm not sure";
  if (q.kind === "amount") {
    const opt = q.options.find((o) => o.value === String(value));
    return opt ? opt.label : Number(value).toLocaleString("en-US", { style: "currency", currency: "USD" });
  }
  const vals = Array.isArray(value) ? value : [String(value)];
  return vals.map((v) => q.options.find((o) => o.value === v)?.label ?? v).join(", ");
}

export function AssistantLine({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p className="mb-4 flex items-start gap-2 rounded-2xl bg-brand-soft px-4 py-3 text-[15px] leading-snug text-brand-2">
      <Sparkles size={18} className="mt-0.5 shrink-0" />
      <span>{text}</span>
    </p>
  );
}

const big =
  "w-full min-h-14 rounded-2xl border-2 px-5 py-3.5 text-left text-base font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-mint";

export function QuestionCard({
  q,
  current,
  onAnswer,
  onSkip,
  onCancel,
}: {
  q: QuestionState;
  current?: AnswerValue;
  onAnswer: (v: AnswerValue) => void;
  onSkip?: () => void;
  onCancel?: () => void;
}) {
  const [why, setWhy] = useState(false);
  const [multi, setMulti] = useState<string[]>(Array.isArray(current) ? current : []);
  const [amount, setAmount] = useState<string>(typeof current === "number" ? String(current) : "");

  const optBtn = (value: string, label: string, onClick: () => void, selected = false) => (
    <button
      key={value}
      onClick={onClick}
      aria-pressed={selected}
      className={cn(big, selected ? "border-brand bg-brand-soft text-brand-2" : "border-line bg-white text-ink hover:border-ink-3")}
    >
      {label}
    </button>
  );

  return (
    <div>
      <AssistantLine text={q.lead ?? null} />
      <h2 className="text-2xl leading-tight font-semibold tracking-tight text-ink sm:text-[28px]">{q.text}</h2>

      <button
        onClick={() => setWhy((w) => !w)}
        aria-expanded={why}
        className="mt-3 flex items-center gap-1 text-sm font-medium text-info hover:underline"
      >
        Why does this matter? <ChevronDown size={14} className={cn("transition-transform", why && "rotate-180")} />
      </button>
      {why && (
        <div className="mt-2 rounded-xl bg-info-soft p-3 text-sm leading-relaxed text-ink">
          {q.why}{" "}
          {q.whyLink && (
            <a href={q.whyLink.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-info underline">
              {q.whyLink.label} <ExternalLink size={12} />
            </a>
          )}
        </div>
      )}

      <div className="mt-6 space-y-3">
        {q.kind === "choice" && (
          <>
            {q.options.map((o) => optBtn(o.value, o.label, () => onAnswer(o.value), current === o.value))}
            {q.allowNotSure && optBtn(NOT_SURE, "I'm not sure", () => onAnswer(NOT_SURE), current === NOT_SURE)}
          </>
        )}

        {q.kind === "multi" && (
          <>
            {q.options.map((o) =>
              optBtn(
                o.value,
                o.label,
                () => setMulti((m) => (m.includes(o.value) ? m.filter((x) => x !== o.value) : [...m.filter((x) => x !== NOT_SURE), o.value])),
                multi.includes(o.value),
              ),
            )}
            {q.allowNotSure && optBtn(NOT_SURE, "I'm not sure", () => setMulti([NOT_SURE]), multi.includes(NOT_SURE))}
            <button
              disabled={!multi.length}
              onClick={() => onAnswer(multi.includes(NOT_SURE) ? NOT_SURE : multi)}
              className="mt-2 w-full min-h-14 rounded-2xl bg-ink text-base font-semibold text-white disabled:opacity-40"
            >
              Continue
            </button>
          </>
        )}

        {q.kind === "amount" && (
          <>
            <label className="block">
              <span className="text-sm font-medium text-ink-2">{q.amountLabel}</span>
              <div className="mt-1.5 flex items-center rounded-2xl border-2 border-line bg-white px-4 focus-within:border-brand">
                <span className="text-lg text-ink-3">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="num w-full bg-transparent px-2 py-3.5 text-lg font-semibold outline-none"
                  placeholder="0.00"
                />
              </div>
            </label>
            <button
              disabled={amount === "" || Number(amount) < 0}
              onClick={() => onAnswer(Math.round(Number(amount) * 100) / 100)}
              className="w-full min-h-14 rounded-2xl bg-ink text-base font-semibold text-white disabled:opacity-40"
            >
              Use this amount
            </button>
            {q.options.map((o) => optBtn(o.value, o.label, () => onAnswer(Number(o.value))))}
            {q.allowNotSure && optBtn(NOT_SURE, "I'm not sure", () => onAnswer(NOT_SURE))}
          </>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between">
        {onCancel ? (
          <button onClick={onCancel} className="text-sm font-medium text-ink-3 hover:text-ink">
            Cancel
          </button>
        ) : (
          <span />
        )}
        {q.skippable && onSkip && (
          <button onClick={onSkip} className="text-sm font-medium text-ink-3 underline-offset-2 hover:text-ink hover:underline">
            Skip for now
          </button>
        )}
      </div>
    </div>
  );
}
