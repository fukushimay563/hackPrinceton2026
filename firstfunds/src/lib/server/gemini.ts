// One place to create the Gemini client, so FinPilot and W-2 reading behave the same.
// Supports both key types Google issues today:
//  • Gemini Developer API keys from AI Studio (AIza… or the newer AQ.… keys)
//  • Vertex AI express-mode keys (AQ.…): set GEMINI_USE_VERTEX=true
// The key never leaves the server and is never logged.
//
// Model selection lives in ./geminiModel.mjs (shared with scripts/check-gemini.mjs).
// Every AI path (web advisor, iMessage advisor, Deep Agents supervisor, W-2 reading,
// health check) must call geminiModel() — never hardcode a model name elsewhere.
import { GoogleGenAI } from "@google/genai";
import { log } from "@/lib/agents/logger";
import { GEMINI_MODEL_FALLBACK, resolveGeminiModel } from "./geminiModel.mjs";

export { GEMINI_MODEL_FALLBACK };
/** @deprecated use GEMINI_MODEL_FALLBACK */
export const DEFAULT_GEMINI_MODEL = GEMINI_MODEL_FALLBACK;

export function geminiConfigured() {
  return !!process.env.GEMINI_API_KEY?.trim();
}

export function geminiApiKey(): string | undefined {
  return process.env.GEMINI_API_KEY?.trim() || undefined;
}

/** Which model, and whether it came from GEMINI_MODEL or the fallback. Read per call (runtime env). */
export function geminiModelInfo(): { model: string; source: "GEMINI_MODEL" | "fallback"; warning?: string } {
  return resolveGeminiModel(process.env);
}

export function geminiModel(): string {
  return geminiModelInfo().model;
}

export type AiPath = "web-advisor" | "imessage-advisor" | "agents-supervisor" | "w2-extract" | "health";

/**
 * Safe diagnostics: which model was requested, where it came from, and (when Google
 * reports it) the model version that actually served the request. Never logs the key,
 * prompts, answers, or any financial data.
 */
export function logGeminiRequest(path: AiPath, extra: { servedBy?: string; outcome: "gemini" | "offline" | "error"; reason?: string }) {
  const info = geminiModelInfo();
  log(extra.outcome === "error" ? "warn" : "info", "ai.model", {
    path,
    requestedModel: info.model,
    modelSource: info.source,
    ...(info.warning ? { modelWarning: info.warning } : {}),
    backend: geminiBackend(),
    answeredBy: extra.outcome === "gemini" ? "gemini" : "offline-guides",
    ...(extra.servedBy ? { servedBy: extra.servedBy } : {}),
    ...(extra.reason ? { reason: extra.reason.slice(0, 200) } : {}),
  });
}

export function geminiBackend(): "vertex-express" | "gemini-api" {
  const v = (process.env.GEMINI_USE_VERTEX ?? process.env.GOOGLE_GENAI_USE_VERTEXAI ?? "").toLowerCase();
  return v === "true" || v === "1" ? "vertex-express" : "gemini-api";
}

export function geminiClient(): GoogleGenAI | null {
  const apiKey = geminiApiKey();
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey, vertexai: geminiBackend() === "vertex-express" });
}

/** Short, key-free explanation of why a Gemini call failed. */
export function describeGeminiError(e: unknown): string {
  const status = (e as { status?: number })?.status;
  const msg = e instanceof Error ? e.message : String(e);
  if (status === 401 || status === 403 || /API key|PERMISSION_DENIED|UNAUTHENTICATED|unregistered callers/i.test(msg))
    return geminiBackend() === "gemini-api"
      ? "Gemini rejected the API key. If it's a Vertex AI express-mode key, set GEMINI_USE_VERTEX=true."
      : "Vertex AI rejected the API key. If it's an AI Studio key, remove GEMINI_USE_VERTEX.";
  if (status === 404 || /not found|is not supported/i.test(msg)) {
    const m = geminiModel();
    return m === GEMINI_MODEL_FALLBACK
      ? `Model "${m}" isn't available for this key. Run node scripts/check-gemini.mjs to find one that is.`
      : `Model "${m}" isn't available for this key. Fix GEMINI_MODEL or remove it to use ${GEMINI_MODEL_FALLBACK}.`;
  }
  if (status === 429 || /quota|RESOURCE_EXHAUSTED/i.test(msg)) return "Gemini quota or rate limit reached.";
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(msg)) return "Couldn't reach Google (network).";
  return `Gemini error${status ? ` (${status})` : ""}.`;
}

/** Tiny live request used by /api/health?check=gemini. */
export async function pingGemini(): Promise<{ ok: boolean; backend: string; model: string; modelSource: string; servedBy?: string; reason?: string }> {
  const ai = geminiClient();
  const info = geminiModelInfo();
  const base = { backend: geminiBackend(), model: info.model, modelSource: info.source };
  if (!ai) return { ok: false, ...base, reason: "GEMINI_API_KEY is not set." };
  try {
    const r = await ai.models.generateContent({ model: info.model, contents: "Reply with the single word OK.", config: { maxOutputTokens: 5, temperature: 0 } });
    logGeminiRequest("health", { outcome: "gemini", servedBy: r.modelVersion });
    return { ok: !!r.text, ...base, servedBy: r.modelVersion, reason: r.text ? undefined : "Empty response." };
  } catch (e) {
    const reason = describeGeminiError(e);
    logGeminiRequest("health", { outcome: "error", reason });
    return { ok: false, ...base, reason };
  }
}
