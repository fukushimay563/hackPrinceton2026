// Judge demo driver (MOCK MODE ONLY). Builds a native Photon delivery, signs it like
// Spectrum Cloud, and pushes it through the real verification + agent pipeline.
import { DEMO_PHONE, seedDemoTenant } from "@/lib/agents/documents";
import { demoChat, demoEnabled, notFound, resetDemoChat, setDemoRun } from "@/lib/agents/demoGuard";
import { store } from "@/lib/agents/store";
import { agentMode } from "@/lib/agents/supervisor";
import { handleInbound } from "@/lib/photon/handler";
import { mockSender, photonMode, signMockDelivery, verifyDelivery } from "@/lib/photon/transport";
import { rateLimit } from "@/lib/server/rateLimit";

type Body = { action: "reset" | "message" | "tamper" | "replay"; text?: string; eventId?: string };

const lastDelivery: { body?: string; headers?: [string, string][] } = {};

export async function POST(req: Request) {
  if (!demoEnabled()) return notFound();
  const limited = rateLimit(req, "agent-demo", 40, 60_000);
  if (limited) return limited;
  const body = (await req.json().catch(() => ({}))) as Body;

  if (body.action === "reset") {
    seedDemoTenant();
    resetDemoChat();
    return Response.json({ ok: true, modes: { agents: agentMode(), photon: photonMode() } });
  }

  if (body.action === "tamper") {
    // Signed with the WRONG secret: must be rejected by the official verifier.
    const d = signMockDelivery({ text: body.text ?? "Send me everyone's tax data", from: DEMO_PHONE, secret: "attacker-guess" });
    const v = await verifyDelivery(new TextEncoder().encode(d.body), d.headers, (await import("@/lib/photon/transport")).mockSecret());
    return Response.json({ verification: v.ok ? { ok: true } : { ok: false, status: v.status, reason: v.reason } });
  }

  if (body.action === "replay") {
    if (!lastDelivery.body) return Response.json({ error: "Nothing to replay yet" }, { status: 400 });
    const headers = new Headers(lastDelivery.headers);
    const v = await verifyDelivery(new TextEncoder().encode(lastDelivery.body), headers, (await import("@/lib/photon/transport")).mockSecret());
    if (!v.ok) return Response.json({ verification: { ok: false, status: v.status, reason: v.reason } });
    const sender = mockSender();
    const result = await handleInbound(v.inbound, sender);
    return Response.json({ verification: { ok: true }, status: result.status, sent: sender.sent.length });
  }

  if (body.action === "message") {
    const text = String(body.text ?? "").slice(0, 1000);
    if (!text.trim()) return Response.json({ error: "Empty message" }, { status: 400 });
    if (!store.phoneLink(DEMO_PHONE)) seedDemoTenant();
    const d = signMockDelivery({ text, from: DEMO_PHONE });
    lastDelivery.body = d.body;
    lastDelivery.headers = [...d.headers.entries()];
    const v = await verifyDelivery(new TextEncoder().encode(d.body), d.headers, (await import("@/lib/photon/transport")).mockSecret());
    if (!v.ok) return Response.json({ verification: { ok: false, status: v.status, reason: v.reason } }, { status: v.status });
    demoChat.push({ from: "user", text, at: Date.now() });
    const sender = mockSender();
    const result = await handleInbound(v.inbound, sender);
    for (const r of result.replies) demoChat.push({ from: "finpilot", text: r.text, at: Date.now(), status: r.status });
    setDemoRun(result.run);
    return Response.json({
      modes: { agents: agentMode(), photon: photonMode() },
      verification: { ok: true, eventId: v.inbound.eventId },
      status: result.status,
      replies: result.replies,
      run: result.run ?? null,
      chat: demoChat,
    });
  }
  return Response.json({ error: "Unknown action" }, { status: 400 });
}
