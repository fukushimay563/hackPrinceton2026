// Photon 2.0 (Spectrum) native webhook.
// Verifies the signature BEFORE doing anything, dedupes on message.id, acks fast,
// and runs the agents after the response (Vercel keeps `after()` work alive).
import { after } from "next/server";
import { handleInbound } from "@/lib/photon/handler";
import { getSpectrumApp, liveSender, mockSecret, mockSender, photonMode, verifyDelivery } from "@/lib/photon/transport";
import { log } from "@/lib/agents/logger";
import { rateLimit } from "@/lib/server/rateLimit";

export async function POST(req: Request) {
  const limited = rateLimit(req, "photon-webhook", 120, 60_000);
  if (limited) return limited;
  if (Number(req.headers.get("content-length") ?? 0) > 256_000) return Response.json({ error: "Payload too large" }, { status: 413 });

  if (photonMode() === "live") {
    // Official SDK verifies the signature (401 on mismatch) and builds the Space.
    const app = await getSpectrumApp();
    let deliver!: (v: { space: { id: string; send: (t: string) => Promise<unknown> }; message: Record<string, unknown> }) => void;
    const delivered = new Promise<{ space: { id: string; send: (t: string) => Promise<unknown> }; message: Record<string, unknown> }>((ok) => (deliver = ok));
    const res = await app.webhook(req, (space, message) => deliver({ space, message: message as Record<string, unknown> }));
    if (res.status !== 200) {
      log("warn", "photon.webhook.rejected", { status: res.status });
      return res;
    }
    after(async () => {
      const timeout = new Promise<null>((ok) => setTimeout(() => ok(null), 10_000));
      const got = await Promise.race([delivered, timeout]);
      if (!got) return;
      const m = got.message as { id: string; content?: { type: string; text?: string }; sender?: { id?: string }; platform?: string };
      await handleInbound(
        { eventId: m.id, spaceId: got.space.id, senderId: m.sender?.id ?? null, platform: m.platform ?? "imessage", text: m.content?.type === "text" ? (m.content.text ?? null) : null, at: Date.now() },
        liveSender(got.space),
      );
    });
    return res;
  }

  // MOCK mode: same official verifier + schema, local test secret, replies recorded.
  const raw = new Uint8Array(await req.arrayBuffer());
  const v = await verifyDelivery(raw, req.headers, mockSecret());
  if (!v.ok) {
    log("warn", "photon.webhook.rejected", { status: v.status, reason: v.reason, mode: "mock" });
    return Response.json({ error: v.reason }, { status: v.status });
  }
  after(() => handleInbound(v.inbound, mockSender()).then(() => undefined));
  return Response.json({ ok: true, mode: "mock", eventId: v.inbound.eventId });
}
