// Tenant-isolated storage for the agent system.
//
// Two strictly separate areas:
//  1. PRIVATE (per tenant): taxpayer documents, answers, saved estimates, and agent
//     memory. Memory payloads are AES-GCM encrypted with the tenant id as AAD, so a
//     record can't even be decrypted under another tenant.
//  2. SHARED (no taxpayer data): sanitized engineering/workflow knowledge. Every
//     write is redacted (identifiers AND amounts) before it's stored.
//
// This in-memory implementation is the default (demo + tests). The same interface
// maps onto the Supabase tables in supabase/migrations/*_agents.sql.
import { randomUUID } from "node:crypto";
import { decrypt, encrypt } from "./crypto";
import { redactAmounts, redactText } from "./redact";

export type DocKind = "W-2" | "1099-NEC";
export type StoredDocument = { id: string; kind: DocKind; fileName: string; textEnc: string; uploadedAt: number; synthetic: boolean };
export type Answers = { dependent?: "yes" | "no" | "not_sure" };
export type FieldOverride = { federalWithheld?: number; by: "user"; via: "secure-link"; at: number };
export type SavedEstimate = { taxYear: number; tax: number; withholding: number; refund: number; approvedAt: number; runId: string };

export type AuditEntry = { at: number; tenant: string; actor: "user" | "agent" | "system"; action: string; detail: Record<string, string | number | boolean> };

export type MemoryKind = "source-ref" | "correction" | "pattern" | "validation" | "approval" | "error";
type PrivateMemory = { id: string; tenant: string; kind: MemoryKind; payloadEnc: string; at: number };
export type SharedNote = { id: string; kind: "pattern" | "correction" | "validation"; note: string; at: number };

export type PhoneLink = { phone: string; tenant: string; notifyConsent: boolean; consentAt: number | null; stopped: boolean };
export type ConversationState = { pending: null | { kind: "dependent" }; lastRunId: string | null; updatedAt: number };
export type OutboxItem = { key: string; tenant: string; spaceId: string; text: string; status: "queued" | "sent" | "failed"; attempts: number; lastError?: string; at: number };

type TenantData = {
  documents: StoredDocument[];
  answers: Answers;
  overrides: Record<string, FieldOverride>; // docId → user-entered values
  savedEstimate: SavedEstimate | null;
};

class MemoryStore {
  private tenants = new Map<string, TenantData>();
  private memory: PrivateMemory[] = [];
  private shared: SharedNote[] = [];
  private audit: AuditEntry[] = [];
  private phones = new Map<string, PhoneLink>();
  private conversations = new Map<string, ConversationState>();
  private processed = new Map<string, number>(); // event id → expiry
  private outbox = new Map<string, OutboxItem>();

  // ------------------------------------------------------------ tenants
  private t(tenant: string): TenantData {
    if (!tenant || typeof tenant !== "string") throw new Error("tenant required");
    let d = this.tenants.get(tenant);
    if (!d) {
      d = { documents: [], answers: {}, overrides: {}, savedEstimate: null };
      this.tenants.set(tenant, d);
    }
    return d;
  }

  addDocument(tenant: string, doc: { kind: DocKind; fileName: string; text: string; synthetic?: boolean }): string {
    const id = `doc_${randomUUID().slice(0, 8)}`;
    this.t(tenant).documents.push({ id, kind: doc.kind, fileName: doc.fileName, textEnc: encrypt(doc.text, `doc:${tenant}`), uploadedAt: Date.now(), synthetic: !!doc.synthetic });
    this.addAudit(tenant, "user", "document.uploaded", { docId: id, kind: doc.kind });
    return id;
  }

  /** Decrypted documents for ONE tenant. There is no "list all tenants" API. */
  documents(tenant: string): { id: string; kind: DocKind; fileName: string; text: string; synthetic: boolean }[] {
    return this.t(tenant).documents.map((d) => ({ id: d.id, kind: d.kind, fileName: d.fileName, synthetic: d.synthetic, text: decrypt(d.textEnc, `doc:${tenant}`) }));
  }

  answers(tenant: string): Answers {
    return { ...this.t(tenant).answers };
  }

  /** User-originated answer (from a verified channel). Agents never call this. */
  setAnswer(tenant: string, key: keyof Answers, value: Answers[keyof Answers], via: "photon" | "web") {
    this.t(tenant).answers[key] = value;
    this.addAudit(tenant, "user", "answer.set", { key, via });
  }

  overrides(tenant: string): Record<string, FieldOverride> {
    return { ...this.t(tenant).overrides };
  }

  /** User-entered field via a verified secure link. Agents never call this. */
  setOverride(tenant: string, docId: string, field: "federalWithheld", value: number) {
    const d = this.t(tenant);
    if (!d.documents.some((x) => x.id === docId)) throw new Error("document not found for tenant");
    d.overrides[docId] = { ...(d.overrides[docId] ?? {}), [field]: value, by: "user", via: "secure-link", at: Date.now() };
    this.addAudit(tenant, "user", "field.provided", { docId, field, via: "secure-link" });
  }

  savedEstimate(tenant: string) {
    return this.t(tenant).savedEstimate;
  }

  /** Only reachable through the approval-gated agent tool (human-in-the-loop). */
  saveEstimate(tenant: string, est: SavedEstimate) {
    this.t(tenant).savedEstimate = est;
    this.addAudit(tenant, "agent", "estimate.saved.after_approval", { runId: est.runId, taxYear: est.taxYear });
  }

  // ------------------------------------------------------------ private memory
  remember(tenant: string, kind: MemoryKind, payload: Record<string, unknown>) {
    this.t(tenant);
    this.memory.push({ id: randomUUID(), tenant, kind, payloadEnc: encrypt(JSON.stringify(payload), `mem:${tenant}`), at: Date.now() });
  }

  recall(tenant: string, kind?: MemoryKind): { kind: MemoryKind; payload: Record<string, unknown>; at: number }[] {
    return this.memory
      .filter((m) => m.tenant === tenant && (!kind || m.kind === kind))
      .map((m) => ({ kind: m.kind, at: m.at, payload: JSON.parse(decrypt(m.payloadEnc, `mem:${tenant}`)) }));
  }

  /** For tests: raw ciphertext lookup, to prove cross-tenant decryption fails. */
  _rawMemory() {
    return this.memory;
  }

  // ------------------------------------------------------------ shared knowledge
  shareLesson(kind: SharedNote["kind"], note: string): SharedNote {
    const clean = redactAmounts(redactText(note)).slice(0, 1000);
    const entry = { id: randomUUID(), kind, note: clean, at: Date.now() };
    this.shared.push(entry);
    return entry;
  }

  sharedLessons() {
    return [...this.shared];
  }

  // ------------------------------------------------------------ audit
  addAudit(tenant: string, actor: AuditEntry["actor"], action: string, detail: AuditEntry["detail"] = {}) {
    this.audit.push({ at: Date.now(), tenant, actor, action, detail });
  }

  auditLog(tenant: string) {
    return this.audit.filter((a) => a.tenant === tenant);
  }

  // ------------------------------------------------------------ messaging
  linkPhone(phone: string, tenant: string, notifyConsent: boolean) {
    this.phones.set(phone, { phone, tenant, notifyConsent, consentAt: notifyConsent ? Date.now() : null, stopped: false });
    this.addAudit(tenant, "user", "channel.linked", { consent: notifyConsent });
  }

  phoneLink(phone: string): PhoneLink | null {
    return this.phones.get(phone) ?? null;
  }

  phonesFor(tenant: string): string[] {
    return [...this.phones.values()].filter((p) => p.tenant === tenant).map((p) => p.phone);
  }

  setStopped(phone: string, stopped: boolean) {
    const p = this.phones.get(phone);
    if (!p) return;
    p.stopped = stopped;
    if (stopped) p.notifyConsent = false;
    this.addAudit(p.tenant, "user", stopped ? "consent.revoked" : "consent.restored", {});
  }

  conversation(tenant: string, spaceId: string): ConversationState {
    const k = `${tenant}::${spaceId}`;
    let c = this.conversations.get(k);
    if (!c) {
      c = { pending: null, lastRunId: null, updatedAt: Date.now() };
      this.conversations.set(k, c);
    }
    return c;
  }

  /** Returns false if this event id was already processed (at-least-once delivery). */
  claimEvent(eventId: string, ttlMs = 24 * 3600_000): boolean {
    const now = Date.now();
    for (const [k, exp] of this.processed) if (exp < now) this.processed.delete(k);
    if (this.processed.has(eventId)) return false;
    this.processed.set(eventId, now + ttlMs);
    return true;
  }

  outboxGet(key: string) {
    return this.outbox.get(key) ?? null;
  }

  outboxPut(item: OutboxItem) {
    this.outbox.set(item.key, item);
  }

  outboxFor(tenant: string) {
    return [...this.outbox.values()].filter((o) => o.tenant === tenant).sort((a, b) => a.at - b.at);
  }

  reset() {
    this.tenants.clear();
    this.memory = [];
    this.shared = [];
    this.audit = [];
    this.phones.clear();
    this.conversations.clear();
    this.processed.clear();
    this.outbox.clear();
  }
}

// One store per server process (survives Next.js dev hot reloads).
const g = globalThis as unknown as { __ffStore?: MemoryStore };
export const store: MemoryStore = (g.__ffStore ??= new MemoryStore());
export type Store = MemoryStore;
