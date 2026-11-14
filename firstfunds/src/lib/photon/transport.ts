// Photon 2.0 (Spectrum) transport.
//
// LIVE mode (SPECTRUM_PROJECT_ID + SPECTRUM_PROJECT_SECRET + SPECTRUM_WEBHOOK_SECRET set):
//   the official SDK verifies each native webhook (HMAC-SHA256 over "v0:<ts>:<rawBody>",
//   5-minute replay window) and gives us the Space to reply on.
// MOCK mode (default): the SAME official verifier (`verifySpectrumSignature`) and payload
//   schema (`slimEnvelopeSchema`) are used, with a local test secret, and replies go to an
//   in-memory transcript. Clearly labelled in the UI and API responses.
import { createHmac, randomUUID } from "node:crypto";
import { slimEnvelopeSchema, verifySpectrumSignature } from "@spectrum-ts/core/webhook";
import type { InboundMessage, Sender } from "./handler";

export function photonMode(): "live" | "mock" {
  return process.env.SPECTRUM_PROJECT_ID && process.env.SPECTRUM_PROJECT_SECRET && process.env.SPECTRUM_WEBHOOK_SECRET ? "live" : "mock";
}

const MOCK_SECRET = () => process.env.PHOTON_MOCK_WEBHOOK_SECRET || "mock-only-webhook-secret";

export type VerifyOutcome =
  | { ok: true; inbound: InboundMessage }
  | { ok: false; status: 400 | 401 | 422 | 500; reason: string };

/** Verify + parse a native Spectrum webhook delivery using the official SDK functions. */
export async function verifyDelivery(rawBody: Uint8Array, headers: Headers, secret: string, now = Date.now()): Promise<VerifyOutcome> {
  if (!secret) return { ok: false, status: 500, reason: "no-webhook-secret" };
  const h: Record<string, string> = {};
  headers.forEach((v, k) => (h[k.toLowerCase()] = v));
  const v = await verifySpectrumSignature({ rawBody, headers: h, secret, now });
  if (!v.ok) return { ok: false, status: v.reason === "missing-headers" ? 400 : 401, reason: v.reason };
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return { ok: false, status: 400, reason: "bad-json" };
  }
  const parsed = slimEnvelopeSchema.safeParse(json);
  if (!parsed.success) return { ok: false, status: 422, reason: "bad-envelope" };
  const m = parsed.data.message;
  const content = m.content as { type: string; text?: unknown };
  return {
    ok: true,
    inbound: {
      eventId: m.id,
      spaceId: m.space.id,
      senderId: m.sender?.id ?? null,
      platform: m.platform ?? m.space.platform ?? "unknown",
      text: content.type === "text" && typeof content.text === "string" ? content.text : null,
      at: m.timestamp ? Date.parse(m.timestamp) || Date.now() : Date.now(),
    },
  };
}

export function mockSecret() {
  return MOCK_SECRET();
}

/** Build + sign a native-format delivery exactly as Spectrum Cloud would (mock/demo/tests). */
export function signMockDelivery(opts: { text: string; from: string; spaceId?: string; eventId?: string; secret?: string; timestamp?: number }) {
  const id = opts.eventId ?? `msg_${randomUUID()}`;
  const spaceId = opts.spaceId ?? `imessage;-;${opts.from}`;
  const body = JSON.stringify({
    event: "message",
    message: {
      id,
      platform: "imessage",
      direction: "inbound",
      timestamp: new Date().toISOString(),
      sender: { id: opts.from, platform: "imessage" },
      space: { id: spaceId, platform: "imessage" },
      content: { type: "text", text: opts.text },
    },
  });
  const ts = String(opts.timestamp ?? Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", opts.secret ?? MOCK_SECRET()).update(`v0:${ts}:${body}`).digest("hex");
  const headers = new Headers({ "content-type": "application/json", "x-spectrum-signature": `v0=${sig}`, "x-spectrum-timestamp": ts });
  return { body, headers, eventId: id, spaceId };
}

/** Mock transport: records what would have been sent. Can simulate delivery failures. */
export function mockSender(opts: { failTimes?: number } = {}): Sender & { sent: string[] } {
  let failures = opts.failTimes ?? 0;
  const sent: string[] = [];
  return {
    mode: "mock",
    sent,
    async send(text) {
      if (failures > 0) {
        failures -= 1;
        throw new Error("simulated delivery failure");
      }
      sent.push(text);
    },
  };
}

// ------------------------------------------------------------------ live
type SpectrumApp = { webhook: (req: Request, handler: (space: { id: string; send: (t: string) => Promise<unknown> }, message: unknown) => void) => Promise<Response> };
let liveApp: Promise<SpectrumApp> | null = null;

/** Lazily start the official Spectrum client (cloud mode, iMessage provider). */
export function getSpectrumApp(): Promise<SpectrumApp> {
  liveApp ??= (async () => {
    const { Spectrum } = await import("spectrum-ts");
    const { imessage } = await import("spectrum-ts/providers/imessage");
    return (await Spectrum({
      projectId: process.env.SPECTRUM_PROJECT_ID!,
      projectSecret: process.env.SPECTRUM_PROJECT_SECRET!,
      webhookSecret: process.env.SPECTRUM_WEBHOOK_SECRET!,
      providers: [imessage.config()],
    } as never)) as unknown as SpectrumApp;
  })();
  return liveApp;
}

export function liveSender(space: { send: (t: string) => Promise<unknown> }): Sender {
  return { mode: "live", send: async (t) => void (await space.send(t)) };
}
