#!/usr/bin/env node
// Which Gemini model and backend does FinPilot use, and does the key work?
//   node scripts/check-gemini.mjs                    # local: reads .env.local, one tiny request per backend
//   node scripts/check-gemini.mjs https://your.app   # deployed: asks the live /api/health?check=gemini
// Uses the same model resolution as the app (src/lib/server/geminiModel.mjs). Never prints the key.
import nextEnv from "@next/env";
import { GoogleGenAI } from "@google/genai";
import { GEMINI_MODEL_FALLBACK, resolveGeminiModel } from "../src/lib/server/geminiModel.mjs";

const target = process.argv[2];

if (target) {
  // ---- deployed check: the server reports what IT resolved at runtime
  const url = `${target.replace(/\/+$/, "")}/api/health?check=gemini`;
  try {
    const r = await fetch(url, { headers: { "cache-control": "no-cache" } });
    const j = await r.json();
    const i = j.integrations ?? {};
    const c = j.geminiCheck ?? {};
    const d = j.deployment ?? {};
    console.log(`Deployment: ${d.env ?? "?"} · branch ${d.branch ?? "?"} · commit ${d.commit ?? "?"}${d.staticBuild ? " · STATIC BUILD (no server AI)" : ""}`);
    console.log(`Key set: ${i.gemini ? "yes" : "no"} · backend: ${i.geminiBackend} · agents: ${i.agents ?? "?"}`);
    console.log(`Model: ${i.geminiModel} (from ${i.geminiModelSource ?? "unknown — this deployment predates the model diagnostics"})${i.geminiModelWarning ? ` ⚠ ${i.geminiModelWarning}` : ""}`);
    if (c.ok) console.log(`✓ Live call works · requested ${c.model} · served by ${c.servedBy ?? "(not reported)"}`);
    else console.log(`✗ Live call failed: ${c.reason ?? `HTTP ${r.status}`}`);
    if (i.geminiModelSource === "fallback") console.log(`\n→ GEMINI_MODEL isn't set for this deployment's environment (${d.env}). Add it in Vercel for that environment, then redeploy.`);
    process.exit(c.ok ? 0 : 1);
  } catch (e) {
    console.log(`✗ Couldn't reach ${url}: ${String(e?.message ?? e).slice(0, 160)}`);
    process.exit(1);
  }
}

// ---- local check
nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error: console.error });
const key = process.env.GEMINI_API_KEY?.trim();
const { model, source, warning } = resolveGeminiModel(process.env);
if (!key) {
  console.log("✗ GEMINI_API_KEY is not set in .env.local");
  process.exit(1);
}
console.log(`Key: ${key.slice(0, 3)}… (${key.length} chars)`);
console.log(`Model: ${model} (from ${source === "GEMINI_MODEL" ? "GEMINI_MODEL" : `fallback — GEMINI_MODEL not set; fallback is ${GEMINI_MODEL_FALLBACK}`})${warning ? ` ⚠ ${warning}` : ""}`);

let networkFailures = 0;
async function attempt(label, opts) {
  try {
    const ai = new GoogleGenAI({ apiKey: key, ...opts });
    const r = await ai.models.generateContent({ model, contents: "Reply with the single word OK.", config: { maxOutputTokens: 5, temperature: 0 } });
    console.log(`✓ ${label}: works (replied "${(r.text ?? "").trim()}", served by ${r.modelVersion ?? "(not reported)"})`);
    return true;
  } catch (e) {
    const status = e?.status ? ` ${e.status}` : "";
    if (!e?.status && /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(String(e?.message ?? e))) networkFailures += 1;
    console.log(`✗ ${label}:${status} ${String(e?.message ?? e).split("\n")[0].slice(0, 160)}`);
    return false;
  }
}

const gemini = await attempt("Gemini Developer API (AI Studio key)", {});
const vertex = await attempt("Vertex AI express mode", { vertexai: true });

if (gemini) console.log("\n→ Leave GEMINI_USE_VERTEX unset. Restart `npm run dev` if it was running.");
else if (vertex) console.log("\n→ Add GEMINI_USE_VERTEX=true to .env.local, then restart `npm run dev`.");
else if (networkFailures === 2) console.log("\n→ Couldn't reach Google from this machine (network), so the key and model weren't tested. Run this where generativelanguage.googleapis.com is reachable.");
else console.log("\n→ Neither backend accepted the key. Check the key, the model name, billing/quota, and that the Generative Language API (or Vertex AI API) is enabled for the key's project.");
process.exit(gemini || vertex ? 0 : 1);
