#!/usr/bin/env node
// Does FinPilot reach the Nessie v2 sandbox? Read-only; never seeds data, moves money, or prints the key.
//   node scripts/check-nessie.mjs                    # local: reads .env.local, calls Nessie directly
//   node scripts/check-nessie.mjs https://your.app   # deployed: asks the live /api/health?check=nessie
import nextEnv from "@next/env";

const target = process.argv[2];
if (target) {
  const url = `${target.replace(/\/+$/, "")}/api/health?check=nessie`;
  try {
    const r = await fetch(url, { headers: { "cache-control": "no-cache" } });
    const j = await r.json();
    const c = j.nessieCheck ?? {};
    const d = j.deployment ?? {};
    console.log(`Deployment: ${d.env ?? "?"} · branch ${d.branch ?? "?"} · commit ${d.commit ?? "?"}`);
    console.log(`Key set: ${j.integrations?.nessie ? "yes" : "no"} · API host: ${c.host ?? j.integrations?.nessieApi?.host ?? "?"}`);
    for (const p of j.integrations?.nessieApi?.problems ?? []) console.log(`! ${p}`);
    if (c.ok) console.log(`✓ GET /accounts → HTTP ${c.status} · ${c.result}`);
    else console.log(`✗ ${c.reason ?? `HTTP ${r.status}`}${c.status ? ` (HTTP ${c.status})` : ""}`);
    process.exit(c.ok ? 0 : 1);
  } catch (e) {
    console.log(`✗ Couldn't reach ${url}: ${String(e?.message ?? e).slice(0, 160)}`);
    process.exit(1);
  }
}

nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error: console.error });
const key = process.env.NESSIE_API_KEY?.trim();
const base = (process.env.NESSIE_BASE_URL?.trim() || "https://v2-prod-api.nessieisreal.com").replace(/\/+$/, "");
if (!key) {
  console.log("✗ NESSIE_API_KEY is not set in .env.local");
  process.exit(1);
}
console.log(`Key: ${key.slice(0, 4)}… (${key.length} chars) · API: ${new URL(base).host}`);
if (!key.startsWith("nsk_")) console.log("! The key doesn't start with nsk_ (Nessie v2 keys do).");
if (/\/\/(prod-)?api\.nessieisreal\.com/.test(base)) console.log("! NESSIE_BASE_URL points at the retired v1 API.");

async function call(path) {
  const t = Date.now();
  try {
    const r = await fetch(`${base}${path}`, { headers: { authorization: `Bearer ${key}`, accept: "application/json" } });
    const body = await r.json().catch(() => null);
    const n = Array.isArray(body?.items) ? body.items.length : body?.items === null ? 0 : null;
    console.log(`${r.ok ? "✓" : "✗"} GET ${path.split("?")[0]} → HTTP ${r.status}${n !== null ? ` · ${n} record(s)` : ""}${r.ok ? "" : body?.title ? ` · ${body.title}` : ""} (${Date.now() - t} ms)`);
    return { ok: r.ok, body };
  } catch (e) {
    console.log(`✗ GET ${path.split("?")[0]} → ${String(e?.message ?? e).slice(0, 120)}`);
    return { ok: false, body: null };
  }
}

const accounts = await call("/accounts?limit=100");
if (accounts.ok) {
  const items = accounts.body?.items ?? [];
  if (!items.length) console.log("\n→ Connected, but the sandbox has no accounts yet. FinPilot will show an empty state (no fictional data). Create sandbox data yourself if you want it.");
  else {
    await call(`/accounts/${encodeURIComponent(items[0].id)}/transactions?limit=5`);
    await call("/merchants?limit=5");
    console.log(`\n→ Connected to Nessie v2 with ${items.length}${accounts.body?.next_cursor ? "+" : ""} account(s).`);
  }
}
process.exit(accounts.ok ? 0 : 1);
