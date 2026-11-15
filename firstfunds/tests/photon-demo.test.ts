// Photon demo numbers: normalization, sender extraction, precedence over the linked-account
// check, synthetic-data labelling, consent keywords, and privacy-safe diagnostics.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DEMO_TENANT, seedDemoTenant } from "../src/lib/agents/documents";
import { captureLogs } from "../src/lib/agents/logger";
import { store } from "../src/lib/agents/store";
import { handleInbound } from "../src/lib/photon/handler";
import { maskHandle, normalizeHandle, parseDemoNumbers } from "../src/lib/photon/handles.mjs";
import { mockSecret, mockSender, signMockDelivery, verifyDelivery } from "../src/lib/photon/transport";

const enc = (s: string) => new TextEncoder().encode(s);
const DEMO = "+15555550144"; // 555-01xx: fictional
const OTHER = "+15555550177";

beforeEach(() => {
  seedDemoTenant();
  delete process.env.PHOTON_DEMO_NUMBERS;
});

async function text(from: string, body: string, demoEnv?: string) {
  if (demoEnv !== undefined) process.env.PHOTON_DEMO_NUMBERS = demoEnv;
  const d = signMockDelivery({ text: body, from });
  const v = await verifyDelivery(enc(d.body), d.headers, mockSecret());
  assert.ok(v.ok && v.inbound);
  const sender = mockSender();
  const r = await handleInbound(v.inbound, sender);
  return { r, sent: sender.sent };
}

test("phone numbers normalize to E.164 regardless of formatting", () => {
  for (const raw of ["+15555550144", "+1 (555) 555-0144", "555.555.0144", "5555550144", "15555550144", "1-555-555-0144", " '+1 555 555 0144' ", "tel:+15555550144", "001 555 555 0144"]) {
    assert.equal(normalizeHandle(raw), DEMO, raw);
  }
  assert.equal(normalizeHandle("+44 20 7946 0958"), "+442079460958");
  assert.equal(normalizeHandle("0044 (20) 7946-0958"), "+442079460958");
  assert.equal(normalizeHandle("Maya.Demo@Example.COM"), "maya.demo@example.com");
  for (const bad of ["", "123", "hello", "+0123456789", "555-0144", null, undefined]) assert.equal(normalizeHandle(bad as string), null, String(bad));
});

test("PHOTON_DEMO_NUMBERS parsing tolerates quotes, separators and spacing; counts bad entries", () => {
  const p = parseDemoNumbers('"+1 (555) 555-0144, 555 555 0177;\n+44 20 7946 0958 , nonsense"');
  assert.deepEqual([...p.handles].sort(), ["+15555550144", "+15555550177", "+442079460958"]);
  assert.equal(p.invalid, 1);
  assert.equal(parseDemoNumbers(undefined).handles.size, 0);
});

test("masked handles never reveal the full number", () => {
  const m = maskHandle(DEMO);
  assert.ok(!m.includes("5555550144") && !m.includes("555555"), m);
  assert.match(m, /^\+1•+44$/);
  assert.equal(maskHandle("maya@example.com"), "m***@***.com");
});

test("matching demo number (formatted differently in the env) gets labelled synthetic taxpayer data", async () => {
  const { r, sent } = await text(DEMO, "Is my 2025 return ready?", "+1 (555) 555-0144");
  assert.equal(r.status, "answered");
  assert.equal(r.route, "supervisor");
  assert.equal(store.phoneLink(DEMO)?.tenant, DEMO_TENANT);
  assert.equal(store.phoneLink(DEMO)?.notifyConsent, false, "demo numbers get no proactive messages");
  assert.match(sent[0], /Demo data: synthetic taxpayer, not a real return/);
});

test("non-matching number gets no demo data: personal → link prompt, general → FinPilot only", async () => {
  const personal = await text(OTHER, "Is my 2025 return ready?", DEMO);
  assert.equal(personal.r.status, "unlinked");
  assert.ok(!personal.r.run);
  assert.match(personal.sent[0], /link this number/);
  assert.equal(store.phoneLink(OTHER), null);
  const general = await text(OTHER, "What is a W-2?", DEMO);
  assert.equal(general.r.route, "finpilot");
  assert.doesNotMatch(general.sent[0], /Demo data|41,600|Maya/);
});

test("demo match uses the SENDER, never the shared line that received the text", async () => {
  // signMockDelivery's receiving line is +15555550100; listing it must not make strangers demo users.
  const { r } = await text(OTHER, "Is my 2025 return ready?", "+15555550100");
  assert.equal(r.status, "unlinked");
  assert.equal(store.phoneLink(OTHER), null);
});

test("demo detection runs before the linked-account check, but never overrides a real link", async () => {
  store.linkPhone(DEMO, "tenant_real_user", true);
  await text(DEMO, "hi", DEMO);
  assert.equal(store.phoneLink(DEMO)?.tenant, "tenant_real_user");
});

test("STOP / START / HELP still work for demo numbers", async () => {
  const help = await text(DEMO, "HELP", DEMO);
  assert.equal(help.r.status, "help");
  assert.match(help.sent[0], /DEMO/);
  assert.match(help.sent[0], /synthetic demo taxpayer/);
  const stop = await text(DEMO, "STOP", DEMO);
  assert.equal(stop.r.status, "opted-out");
  const silent = await text(DEMO, "Is my 2025 return ready?", DEMO);
  assert.equal(silent.r.status, "stopped");
  assert.equal(silent.sent.length, 0);
  const start = await text(DEMO, "START", DEMO);
  assert.equal(start.r.status, "opted-in");
});

test("diagnostics show demo match status without phone numbers or taxpayer data", async () => {
  const cap = captureLogs();
  try {
    await text(DEMO, "Is my 2025 return ready?", DEMO);
    await text(OTHER, "Is my 2025 return ready?", DEMO);
  } finally {
    cap.stop();
  }
  const lines = cap.lines();
  const ids = lines.map((l) => JSON.parse(l) as Record<string, unknown>).filter((l) => l.event === "photon.inbound.identity");
  assert.deepEqual(ids.map((l) => [l.sender, l.demoNumber, l.linked, l.demoTenant]), [
    [maskHandle(DEMO), true, true, true],
    [maskHandle(OTHER), false, false, false],
  ]);
  const all = lines.join("\n");
  assert.doesNotMatch(all, /5555550144|5555550177|41,600|41600|Brightline|Maya/);
  assert.ok(lines.some((l) => l.includes('"photon.reply.sent"')), "delivery result is logged");
});
