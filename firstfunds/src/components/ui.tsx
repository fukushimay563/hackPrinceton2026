"use client";
import { Info } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-2xl border border-line bg-card p-5 shadow-[0_1px_2px_rgba(14,26,36,0.04)] sm:p-6", className)}>
      {children}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  className,
  type = "button",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  const styles = {
    primary: "bg-ink text-white hover:bg-ink-2",
    secondary: "bg-white text-ink border border-line hover:border-ink-3",
    ghost: "text-ink-2 hover:bg-black/5",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:cursor-not-allowed disabled:opacity-50",
        styles,
        className,
      )}
    >
      {children}
    </button>
  );
}

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
          className="absolute bottom-6 left-1/2 z-30 w-64 -translate-x-1/2 rounded-lg bg-ink px-3 py-2 text-xs leading-relaxed font-normal text-white shadow-lg"
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
  const color = { default: "text-ink", good: "text-brand", bad: "text-debt", warn: "text-warn" }[tone];
  return (
    <div>
      <div className="flex items-center text-xs font-medium tracking-wide text-ink-3 uppercase">
        {label}
        {tip && <InfoTip label={`About ${label}`}>{tip}</InfoTip>}
      </div>
      <div className={cn("num mt-1 text-2xl font-semibold sm:text-3xl", color)}>{value}</div>
      {sub && <div className="mt-0.5 text-sm text-ink-3">{sub}</div>}
    </div>
  );
}

export function Badge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "good" | "bad" | "warn" | "info" }) {
  const s = {
    default: "bg-black/5 text-ink-2",
    good: "bg-brand-soft text-brand-2",
    bad: "bg-debt-soft text-debt",
    warn: "bg-warn-soft text-warn",
    info: "bg-info-soft text-info",
  }[tone];
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", s)}>{children}</span>;
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
        {step && <div className="text-xs font-semibold tracking-widest text-brand uppercase">{step}</div>}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-ink-2">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}
