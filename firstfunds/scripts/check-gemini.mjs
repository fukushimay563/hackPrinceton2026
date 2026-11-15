#!/usr/bin/env node
// Which Google backend accepts your GEMINI_API_KEY? Reads .env.local, makes one tiny
// request to each backend, and prints the result. Never prints the key.
//   node scripts/check-gemini.mjs
import nextEnv from "@next/env";
import { GoogleGenAI } from "@google/genai";

nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error: console.error });
const key = process.env.GEMINI_API_KEY?.trim();
const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
if (!key) {
  console.log("✗ GEMINI_API_KEY is not set in .env.local");
  process.exit(1);
}
console.log(`Key: ${key.slice(0, 3)}… (${key.length} chars) · model: ${model}`);

async function attempt(label, opts) {
  try {
    const ai = new GoogleGenAI({ apiKey: key, ...opts });
    const r = await ai.models.generateContent({ model, contents: "Reply with the single word OK.", config: { maxOutputTokens: 5, temperature: 0 } });
    console.log(`✓ ${label}: works (replied "${(r.text ?? "").trim()}")`);
    return true;
  } catch (e) {
    const status = e?.status ? ` ${e.status}` : "";
    console.log(`✗ ${label}:${status} ${String(e?.message ?? e).split("\n")[0].slice(0, 160)}`);
    return false;
  }
}

const gemini = await attempt("Gemini Developer API (AI Studio key)", {});
const vertex = await attempt("Vertex AI express mode", { vertexai: true });

if (gemini) console.log("\n→ Leave GEMINI_USE_VERTEX unset. Restart `npm run dev` if it was running.");
else if (vertex) console.log("\n→ Add GEMINI_USE_VERTEX=true to .env.local, then restart `npm run dev`.");
else console.log("\n→ Neither backend accepted the key. Check the key, the model name, billing/quota, and that the Generative Language API (or Vertex AI API) is enabled for the key's project.");
process.exit(gemini || vertex ? 0 : 1);
