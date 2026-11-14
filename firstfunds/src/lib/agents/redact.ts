// Sensitive-data redaction for logs, shared memory and outbound messages.
// Conservative by design: it's fine to over-redact a log line.

const RULES: [RegExp, string][] = [
  [/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN]"], // SSN
  [/\b(?:XXX|\*{3})-?(?:XX|\*{2})-?\d{4}\b/gi, "[SSN]"], // masked SSN still identifies last 4
  [/\b\d{2}-\d{7}\b/g, "[EIN]"], // full EIN
  [/\b(?:\d[ -]?){13,19}\b/g, "[CARD_OR_ACCOUNT]"], // card / long account numbers
  [/\b\d{9,17}\b/g, "[ACCOUNT]"], // routing / account numbers
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]"],
  [/\+?1?[ .-]?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\b/g, "[PHONE]"],
];

export function redactText(s: string): string {
  let out = s;
  for (const [re, rep] of RULES) out = out.replace(re, rep);
  return out;
}

/** Also redact dollar amounts — for shared (cross-tenant) knowledge and lock-screen-safe messages. */
export function redactAmounts(s: string): string {
  return s.replace(/\$\s?\d[\d,]*(?:\.\d{1,2})?/g, "[AMOUNT]");
}

const SENSITIVE_KEYS = /ssn|social|ein|tin|account|routing|card|password|secret|token|phone|email|address|wages|withheld|income|amount|refund|text|content|raw/i;

/** Deep-redact an object for logging: sensitive keys are replaced, strings are scrubbed. */
export function redactObject(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[DEPTH]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactText(value).slice(0, 500);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redactObject(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.test(k) ? "[REDACTED]" : redactObject(v, depth + 1);
    }
    return out;
  }
  return "[UNSUPPORTED]";
}
