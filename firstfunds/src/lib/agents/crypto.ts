// AES-256-GCM encryption for private agent memory at rest.
// Key: MEMORY_ENCRYPTION_KEY (32 bytes, base64). A random per-process key is used
// in development, which means dev data doesn't survive restarts (by design).
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

let devKey: Buffer | null = null;

function key(): Buffer {
  const env = process.env.MEMORY_ENCRYPTION_KEY;
  if (env) {
    const k = Buffer.from(env, "base64");
    if (k.length !== 32) throw new Error("MEMORY_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
    return k;
  }
  if (process.env.NODE_ENV === "production" && process.env.VERCEL) throw new Error("MEMORY_ENCRYPTION_KEY is required in production");
  devKey ??= randomBytes(32);
  return devKey;
}

/** Returns "v1.<iv>.<tag>.<ciphertext>" (base64url parts). `aad` binds the ciphertext to a tenant. */
export function encrypt(plaintext: string, aad: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(plaintext, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decrypt(payload: string, aad: string): string {
  const [v, iv, tag, ct] = payload.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Bad ciphertext format");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}
