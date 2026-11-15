// One place to create the Gemini client, so FinPilot and W-2 reading behave the same.
// Supports both key types Google issues today:
//  • Gemini Developer API keys from AI Studio (AIza… or the newer AQ.… keys)
//  • Vertex AI express-mode keys (AQ.…): set GEMINI_USE_VERTEX=true
// The key never leaves the server and is never logged.
import { GoogleGenAI } from "@google/genai";

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

export function geminiConfigured() {
  return !!process.env.GEMINI_API_KEY?.trim();
}

export function geminiModel() {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

export function geminiBackend(): "vertex-express" | "gemini-api" {
  const v = (process.env.GEMINI_USE_VERTEX ?? process.env.GOOGLE_GENAI_USE_VERTEXAI ?? "").toLowerCase();
  return v === "true" || v === "1" ? "vertex-express" : "gemini-api";
}

export function geminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
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
  if (status === 404 || /not found|is not supported/i.test(msg)) return `Model "${geminiModel()}" isn't available for this key. Try GEMINI_MODEL=${DEFAULT_GEMINI_MODEL}.`;
  if (status === 429 || /quota|RESOURCE_EXHAUSTED/i.test(msg)) return "Gemini quota or rate limit reached.";
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(msg)) return "Couldn't reach Google (network).";
  return `Gemini error${status ? ` (${status})` : ""}.`;
}

/** Tiny live request used by /api/health?check=gemini. */
export async function pingGemini(): Promise<{ ok: boolean; backend: string; model: string; reason?: string }> {
  const ai = geminiClient();
  const base = { backend: geminiBackend(), model: geminiModel() };
  if (!ai) return { ok: false, ...base, reason: "GEMINI_API_KEY is not set." };
  try {
    const r = await ai.models.generateContent({ model: geminiModel(), contents: "Reply with the single word OK.", config: { maxOutputTokens: 5, temperature: 0 } });
    return { ok: !!r.text, ...base, reason: r.text ? undefined : "Empty response." };
  } catch (e) {
    return { ok: false, ...base, reason: describeGeminiError(e) };
  }
}
