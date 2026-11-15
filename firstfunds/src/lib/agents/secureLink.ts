// Short-lived links for "please finish this in the app" requests.
// The token is AES-256-GCM encrypted and authenticated (key derived from
// SECURE_LINK_SECRET), so the URL reveals nothing — not even the internal tenant id —
// and can't be forged or altered. It never contains amounts, names or document data.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export type LinkPurpose = "clarify-field" | "review-estimate" | "upload-document";
export type LinkClaims = { tenant: string; purpose: LinkPurpose; field?: string; docId?: string; thread?: string; exp: number };

function key(): Buffer {
  let s = process.env.SECURE_LINK_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === "production" && process.env.VERCEL) throw new Error("SECURE_LINK_SECRET is required in production");
    s = "dev-only-secure-link-secret";
  }
  return createHash("sha256").update(`firstfunds-link:${s}`).digest();
}

export function signLink(claims: Omit<LinkClaims, "exp">, ttlSeconds = 30 * 60, now = Date.now()): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  c.setAAD(Buffer.from("link.v1"));
  const ct = Buffer.concat([c.update(JSON.stringify({ ...claims, exp: Math.floor(now / 1000) + ttlSeconds }), "utf8"), c.final()]);
  return [iv, c.getAuthTag(), ct].map((b) => b.toString("base64url")).join(".");
}

export function verifyLink(token: string, now = Date.now()): { ok: true; claims: LinkClaims } | { ok: false; reason: "malformed" | "bad-signature" | "expired" } {
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((p) => !p)) return { ok: false, reason: "malformed" };
  let claims: LinkClaims;
  try {
    const [iv, tag, ct] = parts.map((p) => Buffer.from(p, "base64url"));
    const d = createDecipheriv("aes-256-gcm", key(), iv);
    d.setAAD(Buffer.from("link.v1"));
    d.setAuthTag(tag);
    claims = JSON.parse(Buffer.concat([d.update(ct), d.final()]).toString("utf8"));
  } catch {
    return { ok: false, reason: "bad-signature" };
  }
  if (typeof claims.exp !== "number" || claims.exp < Math.floor(now / 1000)) return { ok: false, reason: "expired" };
  return { ok: true, claims };
}

export function appUrl(path: string) {
  const base = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  return `${base.replace(/\/$/, "")}${path}`;
}
