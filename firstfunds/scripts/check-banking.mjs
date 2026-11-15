#!/usr/bin/env node
// Is My Budget reading persisted Nessie records in a deployment? Read-only except the
// health table write that proves the database round trip. Prints counts, never data or keys.
//   node scripts/check-banking.mjs https://your.app
const target = process.argv[2];
if (!target) {
  console.log("Usage: node scripts/check-banking.mjs https://<your-app>");
  process.exit(1);
}
const base = target.replace(/\/+$/, "");
const get = async (path) => {
  const r = await fetch(`${base}${path}`, { headers: { "cache-control": "no-cache" } });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
let ok = true;
const row = (good, label, note = "") => {
  if (!good) ok = false;
  console.log(`${good ? "✓" : "✗"} ${label}${note ? `  ${note}` : ""}`);
};
try {
  const db = await get("/api/health?check=banking");
  const d = db.body.deployment ?? {};
  console.log(`Deployment: ${d.env ?? "?"} · branch ${d.branch ?? "?"} · commit ${d.commit ?? "?"}`);
  const c = db.body.bankingCheck ?? {};
  row(c.backend === "supabase", "Banking storage is Supabase (persistent)", c.backend === "supabase" ? "" : c.reason ?? `backend: ${c.backend}`);
  if (c.backend === "supabase") {
    row(c.roundTrip === true, "Live database write + read-back", c.roundTrip ? `${c.ms} ms` : c.reason ?? "failed");
    row(!c.missing?.length, "Banking migrations applied", c.missing?.length ? `missing: ${c.missing.join(", ")}` : "");
  }
  const n = await get("/api/health?check=nessie");
  const nc = n.body.nessieCheck ?? {};
  row(!!nc.ok, "Nessie v2 reachable", nc.ok ? nc.result : nc.reason ?? "failed");
  const b = await get("/api/banking");
  if (b.status !== 200) row(false, "My Budget API", `HTTP ${b.status}: ${b.body.error ?? ""}`);
  else {
    const s = b.body.source ?? {};
    console.log(`  My Budget: source ${s.provider ?? "?"} (${s.nessieStatus ?? "?"}) · ${b.body.accounts?.length ?? 0} account(s) · ${b.body.totalTransactions ?? 0} transaction(s) · ${b.body.bills?.length ?? 0} bill(s) · ${b.body.loans?.length ?? 0} loan(s)`);
    row(s.provider === "nessie" && s.nessieStatus === "ok" && (b.body.accounts?.length ?? 0) > 0, "My Budget shows Nessie sandbox records");
  }
} catch (e) {
  row(false, `Couldn't reach ${base}`, String(e?.message ?? e).slice(0, 160));
}
process.exit(ok ? 0 : 1);
