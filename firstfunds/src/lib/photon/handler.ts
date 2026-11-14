// Photon (Spectrum) conversation handler: verified inbound text → Deep Agents
// supervisor → verified, channel-safe reply. Channel-agnostic: the transport
// (live Spectrum space or mock) is passed in as a Sender.
import { log } from "../agents/logger";
import { redactText } from "../agents/redact";
import { appUrl } from "../agents/secureLink";
import { runSupervisor, type RunResult } from "../agents/supervisor";
import { store } from "../agents/store";

export type InboundMessage = { eventId: string; spaceId: string; senderId: string | null; platform: string; text: string | null; at: number };
export type Sender = { send: (text: string) => Promise<void>; mode: "live" | "mock" };

export type HandleResult = {
  status: "duplicate" | "ignored" | "unlinked" | "stopped" | "opted-out" | "opted-in" | "answered" | "error";
  run?: RunResult;
  replies: { text: string; status: "sent" | "failed" | "skipped-duplicate" | "blocked-unsafe" }[];
};

const MAX_TEXT = 1000;

/** Messaging channels must never carry identifiers, amounts or document contents. */
export function isSafeForMessage(text: string): boolean {
  const withoutLinks = text.replace(/https?:\/\/\S+/g, "");
  if (redactText(withoutLinks) !== withoutLinks) return false; // SSN, EIN, account, email, phone
  if (/\$\s?\d/.test(withoutLinks)) return false; // dollar amounts
  return true;
}

/** Send with idempotency + bounded retries. Never re-sends something already delivered. */
export async function sendSafely(sender: Sender, tenant: string, spaceId: string, text: string, key: string, attempts = 3): Promise<HandleResult["replies"][number]> {
  const prior = store.outboxGet(key);
  if (prior?.status === "sent") return { text: prior.text, status: "skipped-duplicate" };
  if (!isSafeForMessage(text)) {
    log("warn", "photon.reply.blocked_unsafe", { key });
    text = "I have an update for you. For your privacy, please open FirstFunds to see it.";
  }
  const item = prior ?? { key, tenant, spaceId, text, status: "queued" as const, attempts: 0, at: Date.now() };
  for (let i = item.attempts; i < attempts; i++) {
    try {
      item.attempts = i + 1;
      await sender.send(text);
      store.outboxPut({ ...item, text, status: "sent" });
      log("info", "photon.reply.sent", { key, attempts: item.attempts, mode: sender.mode });
      return { text, status: "sent" };
    } catch (e) {
      item.lastError = e instanceof Error ? e.message.slice(0, 120) : "send failed";
      store.outboxPut({ ...item, text, status: "queued" });
      if (i + 1 < attempts) await new Promise((ok) => setTimeout(ok, 50 * 2 ** i));
    }
  }
  store.outboxPut({ ...item, text, status: "failed" });
  store.addAudit(tenant, "system", "photon.delivery_failed", { key, attempts: item.attempts });
  log("error", "photon.reply.failed", { key, attempts: item.attempts });
  return { text, status: "failed" };
}

function parseYesNo(t: string): "yes" | "no" | "not_sure" | null {
  const s = t.trim().toLowerCase().replace(/[.!]/g, "");
  if (/^(yes|y|yeah|yep)$/.test(s)) return "yes";
  if (/^(no|n|nope)$/.test(s)) return "no";
  if (/^(not sure|unsure|idk|i don'?t know|maybe)$/.test(s)) return "not_sure";
  return null;
}

export async function handleInbound(msg: InboundMessage, sender: Sender): Promise<HandleResult> {
  // 1. At-least-once delivery → exactly-once side effects.
  if (!store.claimEvent(`photon:${msg.eventId}`)) {
    log("info", "photon.inbound.duplicate", { eventId: msg.eventId });
    return { status: "duplicate", replies: [] };
  }
  if (!msg.text || !msg.senderId) return { status: "ignored", replies: [] };
  const text = msg.text.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, MAX_TEXT);

  // 2. Identity: only linked numbers reach a taxpayer's data.
  const link = store.phoneLink(msg.senderId);
  if (!link) {
    const reply = await sendSafely(sender, "unlinked", msg.spaceId, `Hi! To use FirstFunds by text, link this number from your Account page first: ${appUrl("/account")}`, `reply:${msg.eventId}`);
    return { status: "unlinked", replies: [reply] };
  }
  const { tenant } = link;
  const convo = store.conversation(tenant, msg.spaceId);

  // 3. Consent keywords.
  if (/^\s*(stop|unsubscribe|cancel)\s*$/i.test(text)) {
    store.setStopped(msg.senderId, true);
    const reply = await sendSafely(sender, tenant, msg.spaceId, "You're unsubscribed from FirstFunds messages. Reply START to turn them back on.", `reply:${msg.eventId}`);
    return { status: "opted-out", replies: [reply] };
  }
  if (/^\s*(start|unstop)\s*$/i.test(text)) {
    store.setStopped(msg.senderId, false);
    const reply = await sendSafely(sender, tenant, msg.spaceId, "You're subscribed again. Ask me anything about your 2025 return.", `reply:${msg.eventId}`);
    return { status: "opted-in", replies: [reply] };
  }
  if (link.stopped) return { status: "stopped", replies: [] }; // no messages without consent

  // 4. Conversational answers to a pending question are the USER's input, recorded by
  //    the handler with an audit entry — never written by an agent.
  let request = text;
  let ack = "";
  if (convo.pending?.kind === "dependent") {
    const yn = parseYesNo(text);
    if (yn) {
      store.setAnswer(tenant, "dependent", yn, "photon");
      convo.pending = null;
      request = `The taxpayer answered the dependent question: ${yn}.`;
      ack = yn === "not_sure" ? "No problem. We'll come back to that. " : "Thanks, noted. ";
    }
  }
  store.remember(tenant, "pattern", { channel: "photon", intent: request === text ? "question" : "answer" });

  // 5. Supervisor run on this tenant's isolated thread.
  let run: RunResult;
  try {
    run = await runSupervisor({ tenant, threadId: `${tenant}:${msg.spaceId}`, request, channel: "message" });
  } catch (e) {
    log("error", "photon.agent.error", { eventId: msg.eventId, error: e instanceof Error ? e.message : "unknown" });
    store.remember(tenant, "error", { stage: "supervisor", eventId: msg.eventId });
    const reply = await sendSafely(sender, tenant, msg.spaceId, "Sorry, something went wrong on our side. Your information is safe. Please try again in a few minutes.", `reply:${msg.eventId}`);
    return { status: "error", replies: [reply] };
  }

  // 6. Reply = the communication agent's verified, channel-safe text.
  const replyText = ack + (run.reply?.text ?? "I couldn't verify an answer yet. Please open FirstFunds.");
  const reply = await sendSafely(sender, tenant, msg.spaceId, replyText, `reply:${msg.eventId}`);
  convo.pending = run.reply?.asks.includes("dependent") ? { kind: "dependent" } : null;
  convo.lastRunId = run.runId;
  convo.updatedAt = Date.now();
  linkSpace(msg.senderId, msg.spaceId);
  return { status: "answered", run, replies: [reply] };
}

// Remember which conversation to use for consented notifications.
const g = globalThis as unknown as { __ffSpaces?: Map<string, string> };
const spaces = (g.__ffSpaces ??= new Map<string, string>());
function linkSpace(phone: string, spaceId: string) {
  spaces.set(phone, spaceId);
}

/**
 * Proactive notification. Sent ONLY if the user opted in and hasn't replied STOP.
 * Content is generic: no amounts, no document details — just a link to the app.
 */
export async function notify(phone: string, kind: "estimate-saved", runId: string, sender: Sender): Promise<HandleResult["replies"][number] | { status: "no-consent" | "no-conversation" }> {
  const link = store.phoneLink(phone);
  if (!link || !link.notifyConsent || link.stopped) return { status: "no-consent" };
  const spaceId = spaces.get(phone);
  if (!spaceId) return { status: "no-conversation" };
  const text = kind === "estimate-saved" ? `Your verified 2025 estimate is saved. Review it in FirstFunds: ${appUrl("/agents")}` : "";
  return sendSafely(sender, link.tenant, spaceId, text, `notify:${kind}:${runId}`);
}
