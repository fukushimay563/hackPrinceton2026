#!/usr/bin/env node
// Is Photon 2.0 (Beta) ready for live iMessage? Reads .env.local, checks the settings'
// formats, then asks the Photon API (with the official @photon-ai/api client) for the
// project and its webhook destinations. Never prints the API key or signing secret.
//   node scripts/check-photon.mjs                       # check
//   node scripts/check-photon.mjs https://your.app      # also check the webhook points at your deployment
import nextEnv from "@next/env";
import { ApiError, Photon } from "@photon-ai/api";

nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error: console.error });
const id = process.env.PHOTON_PROJECT_ID?.trim();
const key = process.env.PHOTON_API_KEY?.trim();
const secret = process.env.PHOTON_WEBHOOK_SECRET?.trim();
const baseUrl = (process.env.PHOTON_API_URL?.trim() || "https://api.photon.codes").replace(/\/+$/, "");
const appUrl = (process.argv[2] || process.env.APP_URL || "").replace(/\/+$/, "");
const demo = (process.env.PHOTON_DEMO_NUMBERS ?? "").split(",").filter((n) => n.trim()).length;

let ok = true;
const row = (good, label, note = "") => {
  if (!good) ok = false;
  console.log(`${good ? "✓" : "✗"} ${label}${note ? `  ${note}` : ""}`);
};
const isWhsec = (s) => /^whsec_[A-Za-z0-9+/=]+$/.test(s) && Buffer.from(s.slice(6), "base64").length > 0;

row(!!id && /^pho_prj_[0-9a-z]+$/.test(id), "PHOTON_PROJECT_ID", id ? (id.startsWith("pho_prj_") ? id : "should start with pho_prj_") : "missing");
row(!!key && key.startsWith("pho_sk_"), "PHOTON_API_KEY", key ? (key.startsWith("pho_sk_") ? `set (pho_sk_…, ${key.length} chars)` : "should be a project API key starting with pho_sk_") : "missing");
row(!!secret && isWhsec(secret), "PHOTON_WEBHOOK_SECRET", secret ? (isWhsec(secret) ? `set (whsec_…, ${secret.length} chars)` : "should be the webhook destination's signing secret (whsec_…)") : "missing");
for (const old of ["SPECTRUM_PROJECT_ID", "SPECTRUM_PROJECT_SECRET", "SPECTRUM_WEBHOOK_SECRET"]) {
  if (process.env[old]) console.log(`! ${old} is a legacy Spectrum setting and is ignored. Remove it.`);
}
console.log(`  PHOTON_DEMO_NUMBERS: ${demo} number(s) linked to the synthetic demo taxpayer`);
if (!id || !key) {
  console.log("\n→ Add the missing values to .env.local (Photon Beta dashboard → Settings for the project ID, API keys for the key). Until all three are set, the app runs Photon in mock mode.");
  process.exit(1);
}

const photon = new Photon({ baseUrl, headers: { Authorization: `Bearer ${key}` }, timeoutMs: 15_000 });
const explain = (e) => {
  if (e instanceof ApiError) {
    const code = e.body && typeof e.body === "object" ? e.body.code : "";
    const hint = e.status === 401 ? " (key invalid, revoked or expired)" : e.status === 403 ? " (key lacks project:read, or belongs to another project)" : e.status === 404 ? " (check PHOTON_PROJECT_ID)" : "";
    return `${e.status}${code ? ` ${code}` : ""}${hint}${e.requestId ? ` · request ${e.requestId}` : ""}`;
  }
  return String(e?.message ?? e).split("\n")[0].slice(0, 160);
};

try {
  const p = await photon.projects.get({ path: { projectId: id } });
  row(true, "API key accepted for project", `"${p.name}" (${p.slug})`);
} catch (e) {
  // A 200 this client version can't fully decode still proves the key works for the project.
  if (e?.name === "ResponseValidationError" && e.status === 200) row(true, "API key accepted for project");
  else row(false, "API key accepted for project", explain(e));
}

try {
  const page = await photon.projects.listWebhookDestinations({ path: { projectId: id } });
  const dests = (page.destinations ?? []).filter((d) => !d.deletedAt);
  const receives = (d) => (Array.isArray(d.enabledEvents) ? d.enabledEvents : []).some((ev) => ev === "message.received" || ev === "*");
  const candidates = dests.filter((d) => d.url.endsWith("/api/photon/webhook"));
  if (!dests.length) row(false, "Webhook destination", "none yet");
  for (const d of dests) {
    const mine = d.url.endsWith("/api/photon/webhook");
    console.log(`  • ${d.name}: ${d.url} · ${d.status} · events ${JSON.stringify(d.enabledEvents)} · API ${d.apiVersion}${mine ? "" : " (not this app's route)"}`);
  }
  const good = candidates.find((d) => d.status === "enabled" && receives(d));
  if (dests.length) row(!!good, "Webhook destination for /api/photon/webhook with message.received", good ? "found" : "missing, disabled, or not subscribed to message.received");
  if (good && appUrl) row(good.url === `${appUrl}/api/photon/webhook`, "Webhook points at this deployment", good.url === `${appUrl}/api/photon/webhook` ? appUrl : `expected ${appUrl}/api/photon/webhook`);
} catch (e) {
  row(false, "Webhook destinations", explain(e));
}

if (ok) console.log("\n→ Ready. Text the project's iMessage line from a phone to test (e.g. \"what is a W-2?\").");
else console.log("\n→ Fix the ✗ items above. The webhook must be an HTTPS URL ending in /api/photon/webhook, subscribed to message.received, and its whsec_ secret goes in PHOTON_WEBHOOK_SECRET.");
process.exit(ok ? 0 : 1);
