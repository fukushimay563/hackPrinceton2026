"use client";
// Dashboard charts (lazy-loaded). Data always comes from stored transactions or the tax
// calculator; nothing here is invented to fill space.
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useReducedMotion } from "framer-motion";
import { usd } from "@/lib/format";

export type MonthPoint = { month: string; income: number; spending: number };

const monthShort = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
const tick = { fill: "var(--color-ink-3)", fontSize: 12 };

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-card px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold text-ink">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-ink-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} /> {p.name}: <span className="num font-semibold text-ink">{usd(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function IncomeSpendingChart({ data }: { data: MonthPoint[] }) {
  const animate = !useReducedMotion();
  const rows = data.map((d) => ({ ...d, label: monthShort(d.month) }));
  return (
    <div>
      <div className="mb-2 flex gap-4 text-xs text-ink-2" aria-hidden>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-s3" /> Income</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-s1" /> Spending (net of refunds)</span>
      </div>
      <div className="h-56" role="img" aria-label={`Income and spending by month: ${rows.map((r) => `${r.label} income ${usd(r.income)}, spending ${usd(r.spending)}`).join("; ")}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} barGap={4} margin={{ top: 18, right: 4, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--color-line)" />
            <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} />
            <YAxis tick={tick} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => `$${Math.round(v / 100) / 10}k`} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--color-ink)", fillOpacity: 0.04 }} />
            <Bar dataKey="income" name="Income" fill="var(--color-s3)" radius={[4, 4, 0, 0]} maxBarSize={28} animationDuration={500} isAnimationActive={animate}>
              <LabelList dataKey="income" position="top" formatter={(v: unknown) => usd(Number(v))} style={{ fill: "var(--color-ink-2)", fontSize: 11 }} />
            </Bar>
            <Bar dataKey="spending" name="Spending" fill="var(--color-s1)" radius={[4, 4, 0, 0]} maxBarSize={28} animationDuration={500} isAnimationActive={animate} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function TaxChart({ withheld, tax }: { withheld: number; tax: number }) {
  const animate = !useReducedMotion();
  const rows = [
    { name: "Withheld from pay", value: withheld, fill: "var(--color-s2)" },
    { name: "Estimated tax", value: tax, fill: "var(--color-s3)" },
  ];
  return (
    <div className="h-36" role="img" aria-label={`Withheld ${usd(withheld)} versus estimated tax ${usd(tax)}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 64, left: 0, bottom: 0 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" tick={tick} axisLine={false} tickLine={false} width={124} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={22} animationDuration={500} isAnimationActive={animate}>
            {rows.map((r) => <Cell key={r.name} fill={r.fill} />)}
            <LabelList dataKey="value" position="right" formatter={(v: unknown) => usd(Number(v))} style={{ fill: "var(--color-ink)", fontSize: 12, fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
