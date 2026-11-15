// Photon 2.0 conversation handler: verified inbound text → FinPilot (general
// questions) or the Deep Agents supervisor (the asker's own return) → channel-safe
// reply. Channel-agnostic: the transport (live Photon API or mock) is passed in as a Sender.
import { log } from "../agents/logger";
import { redactText } from "../agents/redact";
import { appUrl } from "../agents/secureLink";
import { runSupervisor, type RunResult } from "../agents/supervisor";
import { store } from "../agents/store";
import { DEMO_TENANT, ensureDemoDocuments } from "../agents/documents";
import { answerQuestion, GENERAL_CONTEXT } from "../tutor/answer";
import { demoHandles, maskHandle, normalizeHandle } from "./handles.mjs";

export type InboundMessage = {
  /** Photon message id (dedupe key). */
  eventId: string;
  spaceId: string;
  /** Sender handle: phone number or Apple ID. */
  senderId: string | null;
  platform: string;
  text: string | null;
  at: number;
  /** The project's agent user (line) that received the message; replies go out from it. */
  agentUserId?: string;
};
export type Sender = { send: (text: string, idempotencyKey?: string) => Promise<void>; mode: "live" | "mock" };

export type HandleResult = {
  status: "duplicate" | "ignored" | "unlinked" | "stopped" | "opted-out" | "opted-in" | "help" | "answered" | "error";
  /** Which brain answered: FinPilot (general education, no personal data) or the tax supervisor. */
  route?: "finpilot" | "supervisor";
  run?: RunResult;
  replies: { text: string; status: "sent" | "failed" | "skipped-duplicate" | "blocked-unsafe" }[];
};

const MAX_TEXT = 1000;

/** Messaging channels must never carry identifiers, amounts or document contents. */
export function isSafeForMessage(text: string, opts: { allowPublicAmounts?: boolean } = {}): boolean {
  const withoutLinks = text.replace(/https?:\/\/\S+/g, "");
  if (redactText(withoutLinks) !== withoutLinks) return false; // SSN, EIN, account, email, phone
  // Dollar amounts are blocked unless the answer was built with NO personal context
  // (e.g. "the 2025 standard deduction is $15,750"), where amounts are public rules.
  if (!opts.allowPublicAmounts && /\$\s?\d/.test(withoutLinks)) return false;
  return true;
}

/** Send with idempotency + bounded retries. Never re-sends something already delivered. */
export async function sendSafely(sender: Sender, tenant: string, spaceId: string, text: string, key: string, attempts = 3, opts: { allowPublicAmounts?: boolean } = {}): Promise<HandleResult["replies"][number]> {
  const prior = store.outboxGet(key);
  if (prior?.status === "sent") return { text: prior.text, status: "skipped-duplicate" };
  if (!isSafeForMessage(text, opts)) {
    log("warn", "photon.reply.blocked_unsafe", { key });
    text = "I have an update for you. For your privacy, please open FirstFunds to see it.";
  }
  const item = prior ?? { key, tenant, spaceId, text, status: "queued" as const, attempts: 0, at: Date.now() };
  for (let i = item.attempts; i < attempts; i++) {
    try {
      item.attempts = i + 1;
      await sender.send(text, key);
      store.outboxPut({ ...item, text, status: "sent" });
      log("info", "photon.reply.sent", { key, attempts: item.attempts, mode: sender.mode });
      return { text, status: "sent" };
    } catch (e) {
      item.lastError = e instanceof Error ? e.message.slice(0, 120) : "send failed";
      log("warn", "photon.reply.attempt_failed", { key, attempt: i + 1, mode: sender.mode, error: item.lastError });
      store.outboxPut({ ...item, text, status: "queued" });
      if (i + 1 < attempts) await new Promise((ok) => setTimeout(ok, 50 * 2 ** i));
    }
  }
  store.outboxPut({ ...item, text, status: "failed" });
  store.addAudit(tenant, "system", "photon.delivery_failed", { key, attempts: item.attempts });
  log("error", "photon.reply.failed", { key, attempts: item.attempts, mode: sender.mode, error: item.lastError });
  return { text, status: "failed" };
}

function parseYesNo(t: string): "yes" | "no" | "not_sure" | null {
  const s = t.trim().toLowerCase().replace(/[.!]/g, "");
  if (/^(yes|y|yeah|yep)$/.test(s)) return "yes";
  if (/^(no|n|nope)$/.test(s)) return "no";
  if (/^(not sure|unsure|idk|i don'?t know|maybe)$/.test(s)) return "not_sure";
  return null;
}

const MAX_REPLY = 900;

/**
 * Personal = about the asker's (or anyone's) own return, documents or status, or a
 * reply to a pending question. Those need a linked number and go to the supervisor.
 * Everything else is general money/tax education and goes to FinPilot with no
 * personal context and no banking tools.
 */
export function isPersonalRequest(text: string): boolean {
  const t = text.toLowerCase();
  const firstPerson = /\b(my|me|mine|i|i'm|im|i've|i'd|our|we|us)\b/.test(t);
  const someoneElses = /\b(?!(?:what|it|that|there|here|who|where|how|let|he|she)'s)[a-z]+'s\s+(refund|return|taxes|w-?2|documents?|status|estimate|income|account)/.test(t);
  const returnWords = /(refund|return|w-?2|1099|estimate|status|owe|withh|document|upload|dependent|filing|file|ready|deadline|account|balance|spending|budget|transaction)/.test(t);
  return someoneElses || (firstPerson && returnWords);
}

/** iMessage is plain text: drop [n] citation markers and markdown, keep it short, add sources. */
export function formatForMessage(answer: string, sources: { title: string; url: string }[]): string {
  let text = answer
    .replace(/\s?\[\d+\]/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^#+\s*/gm, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length > MAX_REPLY) text = text.slice(0, text.lastIndexOf(" ", MAX_REPLY)).trimEnd() + "…";
  // Only full public links (in-app paths mean nothing in a text), no duplicates.
  const web = sources.filter((s) => /^https:\/\//.test(s.url));
  const unique = web.filter((s, i) => web.findIndex((o) => o.url === s.url) === i);
  const links = unique.slice(0, 2).map((s) => `• ${s.title.replace(/^Academy: /, "")}: ${s.url}`);
  return links.length ? `${text}\n\nSources:\n${links.join("\n")}` : text;
}


// Opt-outs from numbers that never linked an account still have to be honoured.
const gu = globalThis as unknown as { __ffUnlinkedStops?: Set<string> };
const unlinkedStops = (gu.__ffUnlinkedStops ??= new Set<string>());

const DEMO_HELP_TEXT =
  "FirstFunds DEMO by text. This number uses a synthetic demo taxpayer (not a real person or return). Try \"Is my 2025 return ready?\" or ask any money question like \"what is a W-2?\". Never text real SSNs, account numbers or documents. Reply STOP to opt out.";

const HELP_TEXT =
  "FirstFunds by text: ask any money or tax question (\"what is a W-2?\", \"how does APR work?\"). Questions about your own return need a linked number. Never text your SSN, account numbers or documents. Reply STOP to opt out.";

async function answerGeneral(msg: InboundMessage, text: string, sender: Sender, tenant: string): Promise<HandleResult> {
  try {
    const res = await answerQuestion({ question: text, context: GENERAL_CONTEXT, bankingTools: false, channel: "message" });
    const reply = await sendSafely(sender, tenant, msg.spaceId, formatForMessage(res.answer, res.sources), `reply:${msg.eventId}`, 3, { allowPublicAmounts: true });
    log("info", "photon.finpilot.answered", { eventId: msg.eventId, mode: res.mode });
    return { status: "answered", route: "finpilot", replies: [reply] };
  } catch (e) {
    log("error", "photon.finpilot.error", { eventId: msg.eventId, error: e instanceof Error ? e.message : "unknown" });
    const reply = await sendSafely(sender, tenant, msg.spaceId, "Sorry, I couldn't answer that right now. Please try again in a few minutes.", `reply:${msg.eventId}`);
    return { status: "error", route: "finpilot", replies: [reply] };
  }
}

export async function handleInbound(msg: InboundMessage, sender: Sender): Promise<HandleResult> {
  // 1. At-least-once delivery → exactly-once side effects.
  if (!store.claimEvent(`photon:${msg.eventId}`)) {
    log("info", "photon.inbound.duplicate", { eventId: msg.eventId });
    return { status: "duplicate", replies: [] };
  }
  // Canonical sender handle (E.164 phone or lowercase Apple ID email). This is the
  // person who texted us (Photon's sentBy), never our shared line (receivedBy).
  const handle = normalizeHandle(msg.senderId);
  if (!msg.text || !handle) {
    log("info", "photon.inbound.ignored", { eventId: msg.eventId, reason: !handle ? "no-sender-handle" : "no-text" });
    return { status: "ignored", replies: [] };
  }
  const rawText = msg.text;
  msg = { ...msg, senderId: handle };
  const text = rawText.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, MAX_TEXT);

  // 2. Identity. Demo numbers (PHOTON_DEMO_NUMBERS) are checked BEFORE the linked-account
  //    check and map to the synthetic demo taxpayer, never to a real person's record.
  //    A number already linked to a real account keeps that link.
  let link = store.phoneLink(handle);
  const isDemoNumber = demoHandles().has(handle);
  if (!link && isDemoNumber) {
    ensureDemoDocuments();
    store.linkPhone(handle, DEMO_TENANT, false); // replies only; no proactive notifications
    link = store.phoneLink(handle);
  }
  log("info", "photon.inbound.identity", {
    eventId: msg.eventId,
    sender: maskHandle(handle),
    demoNumber: isDemoNumber,
    demoNumbersConfigured: demoHandles().size,
    linked: !!link,
    demoTenant: link?.tenant === DEMO_TENANT,
  });
  const isStop = /^\s*(stop|unsubscribe|cancel|quit|end)\s*$/i.test(text);
  const isStart = /^\s*(start|unstop)\s*$/i.test(text);
  const isHelp = /^\s*(help|info)\s*$/i.test(text);

  if (!link) {
    if (isStop) {
      unlinkedStops.add(handle);
      const reply = await sendSafely(sender, "unlinked", msg.spaceId, "You're unsubscribed from FirstFunds messages. Reply START to turn them back on.", `reply:${msg.eventId}`);
      return { status: "opted-out", replies: [reply] };
    }
    if (isStart) unlinkedStops.delete(handle);
    if (unlinkedStops.has(handle)) return { status: "stopped", replies: [] };
    if (isHelp || isStart) {
      const reply = await sendSafely(sender, "unlinked", msg.spaceId, HELP_TEXT, `reply:${msg.eventId}`);
      return { status: isStart ? "opted-in" : "help", replies: [reply] };
    }
    if (!isPersonalRequest(text)) return answerGeneral(msg, text, sender, "unlinked");
    const reply = await sendSafely(sender, "unlinked", msg.spaceId, `Hi! I can answer general money and tax questions here. For questions about your own return, link this number from your Account page first: ${appUrl("/account")}`, `reply:${msg.eventId}`);
    return { status: "unlinked", replies: [reply] };
  }
  const { tenant } = link;
  const convo = store.conversation(tenant, msg.spaceId);
  const demoNote = tenant === DEMO_TENANT ? " (Demo data: synthetic taxpayer, not a real return.)" : "";

  // 3. Consent keywords.
  if (isStop) {
    store.setStopped(handle, true);
    const reply = await sendSafely(sender, tenant, msg.spaceId, "You're unsubscribed from FirstFunds messages. Reply START to turn them back on.", `reply:${msg.eventId}`);
    return { status: "opted-out", replies: [reply] };
  }
  if (isStart) {
    store.setStopped(handle, false);
    const reply = await sendSafely(sender, tenant, msg.spaceId, "You're subscribed again. Ask me anything about your 2025 return.", `reply:${msg.eventId}`);
    return { status: "opted-in", replies: [reply] };
  }
  if (link.stopped) return { status: "stopped", replies: [] }; // no messages without consent
  if (isHelp) {
    const reply = await sendSafely(sender, tenant, msg.spaceId, tenant === DEMO_TENANT ? DEMO_HELP_TEXT : HELP_TEXT, `reply:${msg.eventId}`);
    return { status: "help", replies: [reply] };
  }

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
  // General education questions (no pending answer, nothing about their own return) go
  // to FinPilot without personal context, so the reply can't leak their numbers.
  if (request === text && !isPersonalRequest(text)) {
    store.remember(tenant, "pattern", { channel: "photon", intent: "general" });
    return answerGeneral(msg, text, sender, tenant);
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
  const replyText = ack + (run.reply?.text ?? "I couldn't verify an answer yet. Please open FirstFunds.") + demoNote;
  const reply = await sendSafely(sender, tenant, msg.spaceId, replyText, `reply:${msg.eventId}`);
  convo.pending = run.reply?.asks.includes("dependent") ? { kind: "dependent" } : null;
  convo.lastRunId = run.runId;
  convo.updatedAt = Date.now();
  linkSpace(handle, msg);
  return { status: "answered", route: "supervisor", run, replies: [reply] };
}

// Remember which conversation (and receiving line) to use for consented notifications.
type Route = { spaceId: string; agentUserId?: string };
const g = globalThis as unknown as { __ffSpaces?: Map<string, Route> };
const spaces = (g.__ffSpaces ??= new Map<string, Route>());
function linkSpace(phone: string, msg: InboundMessage) {
  spaces.set(phone, { spaceId: msg.spaceId, agentUserId: msg.agentUserId });
}

/**
 * Proactive notification. Sent ONLY if the user opted in and hasn't replied STOP.
 * Content is generic: no amounts, no document details — just a link to the app.
 */
export async function notify(
  phone: string,
  kind: "estimate-saved",
  runId: string,
  sender?: Sender,
): Promise<HandleResult["replies"][number] | { status: "no-consent" | "no-conversation" }> {
  phone = normalizeHandle(phone) ?? phone;
  const link = store.phoneLink(phone);
  if (!link || !link.notifyConsent || link.stopped) return { status: "no-consent" };
  const route = spaces.get(phone);
  if (!route) return { status: "no-conversation" };
  // Live: reply into the existing direct conversation from the line the user texted
  // (a Photon shared line can only message people who messaged it first).
  let s = sender;
  if (!s) {
    if (!route.agentUserId) return { status: "no-conversation" };
    const { liveSender } = await import("./transport");
    s = liveSender({ spaceId: route.spaceId, agentUserId: route.agentUserId });
  }
  const text = kind === "estimate-saved" ? `Your verified 2025 estimate is saved. Review it in FirstFunds: ${appUrl("/agents")}` : "";
  return sendSafely(s, link.tenant, route.spaceId, text, `notify:${kind}:${runId}`);
}
