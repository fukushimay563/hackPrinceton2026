// iMessage handle utilities (plain JS so scripts/check-photon.mjs shares them): one canonical form for phone numbers (E.164) and Apple ID
// emails, used for demo-number matching and phone links, plus privacy-safe masking.

/**
 * Canonical handle: E.164 for phone numbers ("+16095550123"), lowercase for emails.
 * Accepts "+1 (609) 555-0123", "609.555.0123", "6095550123", "16095550123",
 * "0044 20 7946 0958", quoted values, and stray whitespace. 10-digit numbers without a
 * country code are treated as US/Canada (+1), matching the app's US audience.
 * Returns null when the value can't be a phone number or email.
 */
/**
 * @param {string | null | undefined} raw
 * @returns {string | null}
 */
export function normalizeHandle(raw) {
  if (!raw) return null;
  let s = raw.trim().replace(/^["']+|["']+$/g, "").trim();
  if (!s) return null;
  if (s.includes("@")) {
    const email = s.toLowerCase().replace(/^mailto:/, "");
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
  }
  s = s.replace(/^tel:/i, "");
  const plus = s.startsWith("+");
  let digits = s.replace(/\D/g, "");
  if (!digits) return null;
  if (!plus && digits.startsWith("00")) digits = digits.slice(2); // international dialing prefix
  else if (!plus && digits.length === 10) digits = `1${digits}`; // US/Canada without +1
  else if (!plus && !(digits.length === 11 && digits.startsWith("1"))) {
    // Without "+", only NANP forms are unambiguous; longer numbers need "+" or "00".
    if (digits.length < 11) return null;
  }
  if (digits.startsWith("0") || digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

/** Parse PHOTON_DEMO_NUMBERS: entries separated by commas, semicolons or new lines. */
/**
 * @param {string | undefined} value
 * @returns {{ handles: Set<string>; invalid: number }}
 */
export function parseDemoNumbers(value) {
  /** @type {Set<string>} */
  const handles = new Set();
  let invalid = 0;
  const whole = (value ?? "").trim().replace(/^["']+|["']+$/g, "");
  for (const part of whole.split(/[,;\n\r]+/)) {
    if (!part.trim()) continue;
    const h = normalizeHandle(part);
    if (h) handles.add(h);
    else invalid += 1;
  }
  return { handles, invalid };
}

/** @returns {Set<string>} */
export function demoHandles() {
  return parseDemoNumbers(process.env.PHOTON_DEMO_NUMBERS).handles;
}

/** Privacy-safe label for logs: country code + last 2 digits, or first letter of an email. */
/**
 * @param {string | null | undefined} handle
 * @returns {string}
 */
export function maskHandle(handle) {
  if (!handle) return "(none)";
  if (handle.includes("@")) {
    const [user, domain] = handle.split("@");
    return `${user.slice(0, 1)}***@${domain.includes(".") ? `***.${domain.split(".").pop()}` : "***"}`;
  }
  const d = handle.replace(/\D/g, "");
  if (d.length < 4) return "***";
  const cc = d.startsWith("1") ? "1" : d.slice(0, 2);
  return `+${cc}${"•".repeat(Math.max(0, d.length - cc.length - 2))}${d.slice(-2)}`;
}
