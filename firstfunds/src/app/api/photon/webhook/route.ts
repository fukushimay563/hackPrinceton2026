// Photon 2.0 webhook (`message.received`, Standard Webhooks signatures).
// Verifies the signature on the exact raw bytes BEFORE anything else, dedupes on the
// Photon message id (in handleInbound), acks fast with 200, and runs FinPilot / the
// agents after the response (`after()` keeps that work alive on Vercel).
import { after } from "next/server";
import { handleInbound } from "@/lib/photon/handler";
import { isProductionDeployment, liveSender, mockSecret, mockSender, photonConfig, photonConfigProblems, photonMode, verifyDelivery } from "@/lib/photon/transport";
import { log } from "@/lib/agents/logger";
import { rateLimit } from "@/lib/server/rateLimit";

export async function POST(req: Request) {
  const limited = rateLimit(req, "photon-webhook", 120, 60_000);
  if (limited) return limited;
  if (Number(req.headers.get("content-length") ?? 0) > 256_000) return Response.json({ error: "Payload too large" }, { status: 413 });

  const mode = photonMode();
  let secret: string;
  if (mode === "live") {
    const cfg = photonConfig();
    if (!cfg) {
      // Names of the bad settings only; values are never logged or returned.
      log("error", "photon.config.invalid", { problems: photonConfigProblems() });
      return Response.json({ error: "Photon is misconfigured on the server" }, { status: 500 });
    }
    secret = cfg.webhookSecret;
  } else {
    // Production must use the real Photon API: no mock deliveries unless explicitly enabled.
    if (isProductionDeployment() && process.env.ENABLE_AGENT_DEMO !== "1") {
      log("error", "photon.config.missing", { problems: photonConfigProblems() });
      return Response.json({ error: "Photon is not configured" }, { status: 503 });
    }
    secret = mockSecret();
  }

  const raw = new Uint8Array(await req.arrayBuffer());
  const v = await verifyDelivery(raw, req.headers, secret);
  if (!v.ok) {
    log("warn", "photon.webhook.rejected", { status: v.status, reason: v.reason, mode });
    return Response.json({ error: v.reason }, { status: v.status });
  }
  if (!v.inbound) {
    // Other events (and our own outbound echoes) are acknowledged so Photon doesn't retry them.
    return Response.json({ ok: true, mode, ignored: v.ignored });
  }
  const inbound = v.inbound;
  const sender =
    mode === "live" && inbound.agentUserId
      ? liveSender({ spaceId: inbound.spaceId, agentUserId: inbound.agentUserId, parentMessageId: inbound.eventId })
      : mockSender();
  after(async () => {
    try {
      await handleInbound(inbound, sender);
    } catch (e) {
      log("error", "photon.webhook.handler_error", { eventId: inbound.eventId, error: e instanceof Error ? e.message.slice(0, 120) : "unknown" });
    }
  });
  return Response.json({ ok: true, mode, eventId: inbound.eventId });
}
