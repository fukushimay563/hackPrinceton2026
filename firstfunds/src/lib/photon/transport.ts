// Photon 2.0 (Beta) transport for iMessage.
//
// Contract (from Photon's docs at photon.codes/docs/beta, the official `@photon-ai/api`
// client generated from api.photon.codes/openapi.json, and Photon's own Chat SDK adapter):
// - API: https://api.photon.codes, `Authorization: Bearer <project API key pho_sk_...>`,
//   routes under /v1/projects/{pho_prj_...}. Replies: POST /v1/projects/{id}/messages with an
//   `idempotency-key` header and { spaceId, senderId: <receiving agent user>, content, parentMessageId }.
// - Inbound: a project webhook destination subscribed to `message.received`, signed with
//   Standard Webhooks: headers webhook-id / webhook-timestamp / webhook-signature
//   ("v1,<base64 HMAC-SHA256(key, `${id}.${timestamp}.${rawBody}`)>"), key = base64 part of
//   the `whsec_...` signing secret, 5-minute tolerance. Body: { id, type, data: { object: Message } }.
//
// LIVE mode: PHOTON_PROJECT_ID + PHOTON_API_KEY + PHOTON_WEBHOOK_SECRET all set.
// MOCK mode (otherwise): the same verifier and payload shape with a local test secret;
// replies go to an in-memory transcript. Production refuses mock deliveries unless
// ENABLE_AGENT_DEMO=1 (see the webhook route).
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { InboundMessage, Sender } from "./handler";

export const PHOTON_API_URL = "https://api.photon.codes";
const TOLERANCE_SECONDS = 300;

// ------------------------------------------------------------------ config
export type PhotonConfig = { projectId: string; apiKey: string; webhookSecret: string; baseUrl: string };

/** Problems with the live configuration, described without echoing any secret. */
export function photonConfigProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  const problems: string[] = [];
  const id = env.PHOTON_PROJECT_ID?.trim();
  const key = env.PHOTON_API_KEY?.trim();
  const secret = env.PHOTON_WEBHOOK_SECRET?.trim();
  if (!id) problems.push("PHOTON_PROJECT_ID is not set");
  else if (!/^pho_prj_[0-9a-z]+$/.test(id)) problems.push("PHOTON_PROJECT_ID should look like pho_prj_...");
  if (!key) problems.push("PHOTON_API_KEY is not set");
  else if (!key.startsWith("pho_sk_")) problems.push("PHOTON_API_KEY should be a project API key (pho_sk_...)");
  if (!secret) problems.push("PHOTON_WEBHOOK_SECRET is not set");
  else if (!decodeWebhookSecret(secret)) problems.push("PHOTON_WEBHOOK_SECRET should be the destination's signing secret (whsec_...)");
  return problems;
}

export function photonMode(): "live" | "mock" {
  return process.env.PHOTON_PROJECT_ID && process.env.PHOTON_API_KEY && process.env.PHOTON_WEBHOOK_SECRET ? "live" : "mock";
}

export function photonConfig(): PhotonConfig | null {
  if (photonMode() !== "live" || photonConfigProblems().length) return null;
  return {
    projectId: process.env.PHOTON_PROJECT_ID!.trim(),
    apiKey: process.env.PHOTON_API_KEY!.trim(),
    webhookSecret: process.env.PHOTON_WEBHOOK_SECRET!.trim(),
    baseUrl: (process.env.PHOTON_API_URL?.trim() || PHOTON_API_URL).replace(/\/+$/, ""),
  };
}

/** Real production deployment (not preview, not local, not tests). */
export function isProductionDeployment(): boolean {
  if (process.env.NODE_ENV !== "production") return false;
  return process.env.VERCEL ? process.env.VERCEL_ENV === "production" : true;
}

// ------------------------------------------------------------------ Standard Webhooks
/** Decodes a `whsec_<base64>` signing secret into its HMAC key bytes. */
export function decodeWebhookSecret(secret: string): Buffer | null {
  const s = secret.trim();
  if (!s.startsWith("whsec_")) return null;
  const key = Buffer.from(s.slice(6), "base64");
  return key.length ? key : null;
}

type SigCheck = { ok: true; webhookId: string } | { ok: false; reason: "missing-headers" | "expired" | "signature-mismatch" };

export function verifyStandardWebhook(rawBody: Uint8Array, headers: Headers, key: Buffer, now = Date.now()): SigCheck {
  const id = headers.get("webhook-id");
  const ts = headers.get("webhook-timestamp");
  const sigs = headers.get("webhook-signature");
  if (!id || !ts || !sigs || !/^\d+$/.test(ts)) return { ok: false, reason: "missing-headers" };
  if (Math.abs(now / 1000 - Number(ts)) > TOLERANCE_SECONDS) return { ok: false, reason: "expired" };
  const expected = createHmac("sha256", key).update(`${id}.${ts}.`).update(rawBody).digest();
  const match = sigs
    .trim()
    .split(/\s+/)
    .some((entry) => {
      const [version, value] = entry.split(",");
      if (version !== "v1" || !value) return false;
      const candidate = Buffer.from(value, "base64");
      return candidate.length === expected.length && timingSafeEqual(candidate, expected);
    });
  return match ? { ok: true, webhookId: id } : { ok: false, reason: "signature-mismatch" };
}

// ------------------------------------------------------------------ payload
type PhotonUser = { id?: string; handle?: string; kind?: string };
type PhotonMessage = {
  id?: string;
  status?: string;
  platform?: string;
  createdAt?: string;
  content?: { type?: string; text?: unknown };
  sentBy?: PhotonUser;
  receivedBy?: PhotonUser;
  space?: { id?: string; kind?: string };
  timestamps?: { receivedAt?: string };
};

export type VerifyOutcome =
  | { ok: true; inbound: InboundMessage }
  | { ok: true; inbound: null; ignored: string }
  | { ok: false; status: 400 | 401 | 422 | 500; reason: string };

/** Verify a Photon 2.0 webhook delivery and turn a `message.received` event into an InboundMessage. */
export async function verifyDelivery(rawBody: Uint8Array, headers: Headers, secret: string, now = Date.now()): Promise<VerifyOutcome> {
  const key = secret ? decodeWebhookSecret(secret) : null;
  if (!key) return { ok: false, status: 500, reason: "no-webhook-secret" };
  const sig = verifyStandardWebhook(rawBody, headers, key, now);
  if (!sig.ok) return { ok: false, status: sig.reason === "missing-headers" ? 400 : 401, reason: sig.reason };
  let event: { id?: unknown; type?: unknown; data?: { object?: PhotonMessage } };
  try {
    event = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return { ok: false, status: 400, reason: "bad-json" };
  }
  if (!event || typeof event !== "object") return { ok: false, status: 422, reason: "bad-envelope" };
  // The signed webhook-id must be this event's id (prevents splicing a signed id onto another body).
  if (event.id !== sig.webhookId) return { ok: false, status: 401, reason: "event-id-mismatch" };
  if (event.type !== "message.received") return { ok: true, inbound: null, ignored: `event:${String(event.type)}` };
  const m = event.data?.object;
  if (!m?.id || !m.space?.id) return { ok: false, status: 422, reason: "bad-envelope" };
  // Loop protection: only messages a human sent to one of our agents.
  if (m.status !== "received" || m.sentBy?.kind === "agent" || !m.receivedBy?.id) return { ok: true, inbound: null, ignored: "not-inbound" };
  // Financial answers never go into group chats.
  if (m.space.kind && m.space.kind !== "direct") return { ok: true, inbound: null, ignored: "not-direct" };
  const at = Date.parse(m.timestamps?.receivedAt ?? m.createdAt ?? "") || now;
  return {
    ok: true,
    inbound: {
      eventId: m.id, // message id: stable across webhook retries and redeliveries
      spaceId: m.space.id,
      senderId: m.sentBy?.handle ?? null, // phone number or Apple ID: what users link
      platform: m.platform ?? "imessage",
      text: m.content?.type === "text" && typeof m.content.text === "string" ? m.content.text : null,
      at,
      agentUserId: m.receivedBy.id,
    },
  };
}

// ------------------------------------------------------------------ mock
/** Local-only signing secret (whsec_ form). Never valid against Photon. */
export function mockSecret() {
  const custom = process.env.PHOTON_MOCK_WEBHOOK_SECRET?.trim();
  if (custom && decodeWebhookSecret(custom)) return custom;
  return `whsec_${Buffer.from(custom || "firstfunds-mock-only-webhook-secret").toString("base64")}`;
}

/** Build + sign a Photon 2.0 `message.received` delivery exactly as Photon would (mock/demo/tests). */
export function signMockDelivery(opts: { text: string; from: string; spaceId?: string; eventId?: string; secret?: string; timestamp?: number; spaceKind?: string }) {
  const messageId = opts.eventId ?? `pho_msg_${randomUUID().replace(/-/g, "")}`;
  const spaceId = opts.spaceId ?? `pho_spc_mock_${opts.from.replace(/\D/g, "")}`;
  const webhookId = `pho_evt_${randomUUID().replace(/-/g, "")}`;
  const now = new Date().toISOString();
  const body = JSON.stringify({
    id: webhookId,
    type: "message.received",
    data: {
      object: {
        id: messageId,
        status: "received",
        platform: "imessage",
        createdAt: now,
        timestamps: { receivedAt: now },
        content: { type: "text", format: "plain", text: opts.text },
        sentBy: { id: "pho_usr_mock_human", handle: opts.from, kind: "human", platform: "imessage" },
        receivedBy: { id: "pho_usr_mock_agent", handle: "+15555550100", kind: "agent", platform: "imessage" },
        space: { id: spaceId, kind: opts.spaceKind ?? "direct", platform: "imessage" },
      },
    },
  });
  const ts = String(opts.timestamp ?? Math.floor(Date.now() / 1000));
  const secret = opts.secret ?? mockSecret();
  const key = decodeWebhookSecret(secret) ?? Buffer.from(secret); // non-whsec strings: simulated attacker guesses
  const sig = createHmac("sha256", key).update(`${webhookId}.${ts}.${body}`).digest("base64");
  const headers = new Headers({ "content-type": "application/json", "webhook-id": webhookId, "webhook-timestamp": ts, "webhook-signature": `v1,${sig}` });
  return { body, headers, eventId: messageId, spaceId };
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
type PhotonClient = import("@photon-ai/api").Photon;
let client: { key: string; photon: PhotonClient } | null = null;

async function photonClient(cfg: PhotonConfig): Promise<PhotonClient> {
  if (client?.key === `${cfg.baseUrl}|${cfg.projectId}|${cfg.apiKey}`) return client.photon;
  const { Photon } = await import("@photon-ai/api");
  const photon = new Photon({
    baseUrl: cfg.baseUrl,
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    timeoutMs: 10_000,
    retry: { maxAttempts: 2 }, // sendSafely adds bounded retries with the same idempotency key
  });
  client = { key: `${cfg.baseUrl}|${cfg.projectId}|${cfg.apiKey}`, photon };
  return photon;
}

/** Error summary safe for logs: status, problem code and request id. Never headers or bodies. */
export function describePhotonError(e: unknown): string {
  const err = e as { status?: number; body?: { code?: string }; requestId?: string; name?: string };
  if (err?.status) return `Photon API ${err.status}${err.body?.code ? ` ${err.body.code}` : ""}${err.requestId ? ` (request ${err.requestId})` : ""}`;
  return err?.name === "TransportError" ? "Photon API unreachable" : "Photon send failed";
}

/**
 * Sender that replies in the conversation the message arrived in, from the agent line
 * that received it. Each send carries an idempotency key, so retries never double-send.
 */
export function liveSender(route: { spaceId: string; agentUserId: string; parentMessageId?: string }): Sender {
  return {
    mode: "live",
    async send(text, idempotencyKey) {
      const cfg = photonConfig();
      if (!cfg) throw new Error("Photon is not configured");
      const photon = await photonClient(cfg);
      try {
        await photon.projects.sendMessage({
          path: { id: cfg.projectId },
          headers: { "idempotency-key": `firstfunds:${idempotencyKey ?? randomUUID()}`.slice(0, 255) },
          body: {
            spaceId: route.spaceId,
            senderId: route.agentUserId,
            content: { type: "text", format: "plain", text },
            ...(route.parentMessageId ? { parentMessageId: route.parentMessageId } : {}),
          },
        });
      } catch (e) {
        // A 202 whose body this client version can't decode was still accepted by Photon
        // for dispatch; treat it as sent rather than retrying.
        const err = e as { name?: string; status?: number };
        if (err?.name === "ResponseValidationError" && err.status === 202) return;
        throw new Error(describePhotonError(e));
      }
    },
  };
}
