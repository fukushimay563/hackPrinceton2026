"use client";
import { Check, Info, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { DURATION, EASE, pressDown } from "@/lib/motion";
import { useId, useState, type ReactNode } from "react";

export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Card({ className, children, interactive }: { className?: string; children: ReactNode; interactive?: boolean }) {
  return (
    <div className={cn("surface rounded-2xl border border-line p-5 sm:p-6", interactive && "lift hover:-translate-y-0.5 hover:border-ink-3", className)}>
      {children}
    </div>
  );
}

/** Placeholder while data loads; fixed height prevents layout shift. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton h-4", className)} />;
}

/** Friendly empty state with exactly one primary action. */
export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start rounded-xl bg-sunken px-6 py-8 text-left">
      {icon && <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-card text-ink">{icon}</div>}
      <div className="font-semibold text-ink">{title}</div>
      <p className="mt-1 max-w-md text-sm text-ink-3">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * MotionButton: lifts slightly on hover, presses down on tap, and can show a loading
 * spinner or a brief success check. Loading/success reflect real async state from the caller.
 */
export function Button({
  children,
  onClick,
  variant = "primary",
  className,
  type = "button",
  disabled,
  loading,
  success,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  loading?: boolean;
  success?: boolean;
}) {
  const styles = {
    primary: "bg-accent text-on-accent hover:bg-[#d6e41c]",
    secondary: "bg-transparent text-ink border border-ink hover:bg-sunken",
    ghost: "text-ink hover:bg-sunken",
  }[variant];
  const off = disabled || loading;
  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={off}
      aria-busy={loading || undefined}
      whileHover={off ? undefined : { y: -1, transition: { duration: DURATION.hover, ease: EASE.out } }}
      whileTap={off ? undefined : pressDown}
      className={cn(
        "relative inline-flex min-h-11 items-center justify-center gap-2 overflow-hidden rounded-md px-5 py-2.5 text-sm transition-colors duration-200 ease-out disabled:cursor-not-allowed disabled:opacity-60",
        styles,
        className,
      )}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {loading ? (
          <motion.span key="l" className="inline-flex items-center gap-2" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
            <Loader2 size={15} className="animate-spin" /> Working…
          </motion.span>
        ) : success ? (
          <motion.span key="s" className="inline-flex items-center gap-2" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <Check size={15} /> Done
          </motion.span>
        ) : (
          <motion.span key="c" className="inline-flex items-center gap-2" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
            {children}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
export const MotionButton = Button;

export function InfoTip({ children, label = "More info" }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onBlur={() => setOpen(false)}
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-ink-3 hover:text-ink"
      >
        <Info size={14} />
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute bottom-6 left-1/2 z-30 w-64 -translate-x-1/2 rounded-lg bg-obsidian px-3 py-2 text-xs leading-relaxed font-normal text-paper shadow-lg"
        >
          {children}
        </span>
      )}
    </span>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = "default",
  tip,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "good" | "bad" | "warn";
  tip?: ReactNode;
}) {
  const color = { default: "text-ink", good: "text-ink", bad: "text-debt", warn: "text-warn" }[tone];
  return (
    <div>
      <div className="flex items-center text-[11px] tracking-[0.05em] text-ink-3 uppercase">
        {label}
        {tip && <InfoTip label={`About ${label}`}>{tip}</InfoTip>}
      </div>
      <div className={cn("num mt-1.5 text-[28px] leading-[1.14]", color)}>{value}</div>
      {sub && <div className="mt-0.5 text-sm text-ink-3">{sub}</div>}
    </div>
  );
}

export function Badge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "good" | "bad" | "warn" | "info" }) {
  const s = {
    default: "bg-sunken text-ink-2",
    good: "bg-accent text-on-accent",
    bad: "bg-debt-soft text-debt",
    warn: "bg-warn-soft text-warn",
    info: "bg-sunken text-ink",
  }[tone];
  return <span className={cn("inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 text-xs font-semibold", s)}>{children}</span>;
}

export function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  prefix,
  suffix,
  tip,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  prefix?: string;
  suffix?: string;
  tip?: ReactNode;
  hint?: ReactNode;
}) {
  const id = useId();
  const fill = `${Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))}%`;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <label htmlFor={id} className="flex items-center text-sm font-medium text-ink-2">
          {label}
          {tip && <InfoTip label={`About ${label}`}>{tip}</InfoTip>}
        </label>
        <div className="flex items-center rounded-lg border border-line bg-paper px-2 focus-within:border-brand">
          {prefix && <span className="text-sm text-ink-3">{prefix}</span>}
          <input
            aria-label={`${label} value`}
            type="number"
            inputMode="decimal"
            value={Number.isFinite(value) ? value : 0}
            min={min}
            step={step}
            onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
            className="num w-20 bg-transparent py-1 text-right text-sm font-semibold outline-none"
          />
          {suffix && <span className="pl-0.5 text-sm text-ink-3">{suffix}</span>}
        </div>
      </div>
      <input
        id={id}
        type="range"
        className="ff-range"
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, value))}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ["--fill" as string]: fill }}
      />
      {hint && <div className="mt-1.5 text-xs text-ink-3">{hint}</div>}
    </div>
  );
}

export function PageHeader({ step, title, subtitle, right }: { step?: string; title: string; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {step && <div className="text-[11px] tracking-[0.05em] text-ink-3 uppercase">{step}</div>}
        <h1 className="mt-2 text-[28px] leading-[1.14] text-ink sm:text-[40px] sm:leading-[1.05]">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-ink-2">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}
