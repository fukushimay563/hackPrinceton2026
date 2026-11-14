export const usd = (n: number, cents = false) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });

export const pct = (n: number, digits = 0) => `${(Number.isFinite(n) ? n : 0).toFixed(digits)}%`;

export function duration(m: number | null) {
  if (m === null) return "30+ years";
  const y = Math.floor(m / 12);
  const mo = m % 12;
  if (!y) return `${m} mo`;
  return mo ? `${y} yr ${mo} mo` : `${y} yr`;
}

export function durationLong(m: number | null) {
  if (m === null) return "never at this rate";
  const y = Math.floor(m / 12);
  const mo = m % 12;
  if (!y) return `${m} month${m === 1 ? "" : "s"}`;
  return `${y} year${y === 1 ? "" : "s"}${mo ? `, ${mo} month${mo === 1 ? "" : "s"}` : ""}`;
}
