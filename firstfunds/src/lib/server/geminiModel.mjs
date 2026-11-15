// Single source of truth for which Gemini model FinPilot uses. Plain JS with no
// dependencies so the Next.js server code AND `node scripts/check-gemini.mjs` share it.
//
// Rule: GEMINI_MODEL (read at request time, never baked into the build) wins. If it's
// unset or invalid, GEMINI_MODEL_FALLBACK is used. The fallback is the model this
// project's key was verified with (`node scripts/check-gemini.mjs`, 2026-11-15).

export const GEMINI_MODEL_FALLBACK = "gemini-3.5-flash";

/**
 * Resolve the Gemini model from an environment object.
 * Tolerates the usual copy-paste damage (whitespace, quotes, a "models/" prefix).
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ model: string; source: "GEMINI_MODEL" | "fallback"; warning?: string }}
 */
export function resolveGeminiModel(env = process.env) {
  const raw = env.GEMINI_MODEL;
  if (raw === undefined || raw.trim() === "") return { model: GEMINI_MODEL_FALLBACK, source: "fallback" };
  const cleaned = raw
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^models\//, "")
    .trim();
  if (!/^[a-z0-9][a-z0-9.\-]{1,62}$/i.test(cleaned)) {
    return { model: GEMINI_MODEL_FALLBACK, source: "fallback", warning: "GEMINI_MODEL is set but isn't a valid model name; using the fallback." };
  }
  return { model: cleaned, source: "GEMINI_MODEL" };
}
