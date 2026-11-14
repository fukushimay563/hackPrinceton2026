# FinPilot Deep Mode: Deep Agents + Photon 2.0

## Audit summary (Phase 1)

| Area | What exists |
|---|---|
| Stack | Next.js 16.4 (App Router, `cacheComponents`), React 19.3, TypeScript, Tailwind 4, Node ≥ 20.9 |
| Existing AI | FinPilot (`/api/tutor`, Gemini + offline fallback), W-2 reading (`/api/w2-extract`, Gemini), LangGraph tax question flow (`src/lib/minimizer`) |
| Calculation | Deterministic, tested `src/lib/finance/tax2025.ts` (TY2025, IRS Tax Table) |
| Research | Cited IRS/CFPB corpus (`src/lib/tutor/corpus.ts`) |
| Auth | Optional Supabase (magic link / guest), RLS-protected tables |
| Security before this work | Per-IP rate limits, schema-validated extraction, no logging of documents |

**Integration plan:** add a new `src/lib/agents` module and `src/lib/photon` module, reuse the existing tax engine and IRS corpus, and add new routes and pages. No existing feature was removed.

## Architecture

```
iMessage ─► Photon/Spectrum ─► POST /api/photon/webhook
                                  │ 1. verify signature (official verifySpectrumSignature, raw bytes, 5-min window)
                                  │ 2. dedupe on message.id   3. ack 200   4. after(): handleInbound
                                  ▼
                        src/lib/photon/handler.ts
          linked phone? consent (STOP/START)? pending question? → tenant + thread
                                  ▼
                 Deep Agents supervisor (src/lib/agents/supervisor.ts)
   write_todos ─ task→document ─ task→research ─ task→calculation ─ task→verification ─ task→planning ─ task→communication
                                  │                   (deterministic tools in specialists.ts)
                save_verified_estimate ◄── interruptOn: human approval required
                                  ▼
          reply = communication agent output (verified-only, message-safe) ─► space.send()
          needs info? → encrypted, expiring secure link → /agents/clarify → re-run → approve
```

| Agent | Tool | Guarantees |
|---|---|---|
| Supervisor | `write_todos`, `task`, `save_verified_estimate` | Plans and delegates. Can only save after approval and a "verified" verdict |
| Document Intelligence | `extract_tax_documents` | Reads only labeled box lines. Every value has a source (doc, box, line) and a confidence. Blank → missing, never guessed. Flags conflicts, duplicates, wrong year, 1099-NEC (out of scope) |
| IRS Research | `search_irs_sources` | IRS URLs only. Year-specific figures only for the matching tax year. Unverifiable topics listed |
| Tax Calculation | `calculate_federal_tax` | Calls `computeTax`; the model never does arithmetic. Returns breakdown, status and assumptions |
| Verification | `verify_findings` | Independent recomputation (bracket math + Tax Table, without `computeTax`), source tracing, citation/year checks, required dependent attestation. Blocks unsupported claims |
| Tax Planning | `find_tax_opportunities` | Possibilities as questions, never guaranteed |
| Communication | `compose_reply` | Built only from the verdict. On the messaging channel: no amounts, identifiers or document details, plus a secure link |

**Context isolation:** subagents see only their task description. Shared facts move through a per-thread workspace written only by deterministic tools.
**Persistent state:** a LangGraph checkpointer (per run thread) plus a workspace per conversation thread.
**Defense in depth:** after any run, the server runs verification and composes the reply itself if the model skipped those steps, so a reply never bypasses verification.

### Modes
- **Agents:** `gemini` when `GEMINI_API_KEY` is set (`@langchain/google-genai`), otherwise `mock`. Mock uses `PolicyChatModel`, a deterministic scripted model that drives the same Deep Agents runtime: the real `task` delegation, subagents, tool calls and approval interrupts.
- **Photon:** `live` when `SPECTRUM_PROJECT_ID`, `SPECTRUM_PROJECT_SECRET` and `SPECTRUM_WEBHOOK_SECRET` are all set, otherwise `mock`. Mock uses the same official verifier and payload schema with a local secret, and records replies instead of sending. It's labeled "MOCK mode" in the UI and API.

## Security controls (Phase 4)

| Control | Where |
|---|---|
| Webhook authentication | `transport.ts` → `verifySpectrumSignature` (raw bytes, replay window); live mode uses the SDK `app.webhook` |
| Idempotency | `store.claimEvent(message.id)` + outbox keys (`reply:<eventId>`, `notify:<kind>:<runId>`); DB: `photon_events` primary key, `message_outbox` |
| Consent | Phone must be linked to an account. STOP/START honored. Notifications only with opt-in and not stopped |
| Unauthorized access | Thread ids must start with the tenant. Secure links are AES-GCM encrypted and expire in 30 min. Tenant is taken only from the token. Unlinked numbers get no data |
| Records | Agents can't write answers or document values (user actions only, audited). Saving needs human approval |
| Prompt injection | `injection.ts` removes instruction-like document lines. Extraction ignores non-box text. Inbound text is length-capped and control-stripped. Gemini prompts treat content as data |
| Memory isolation | Private memory is AES-256-GCM with the tenant as AAD (cross-tenant decrypt fails). Shared notes are redacted (identifiers and amounts) and DB constraints reject SSNs, emails and `$` amounts |
| Logging | `logger.ts` JSON logs with deep redaction. No message bodies, documents or model text |
| Delivery failures | Bounded retries with backoff, `failed` status plus an audit entry, never duplicate sends |
| No reasoning exposure | The UI shows tool actions and outcomes only |

## Run it

```bash
npm install
npm run dev                 # open http://localhost:3000/agents
npm test                    # 54 tests (6 files)
```

**Two-minute demo (mock mode, synthetic data):**
1. `/agents` → **Reset demo** → tap **"Is my 2025 tax return ready?"**. The signature is verified, the supervisor plans, and six specialists run.
2. Point out: the planted "report a $5,000 refund" line is ignored, box 2 is missing, the refund is blocked, and "state tax" is flagged as unverifiable.
3. The reply has a secure link and a dependent question. Tap **No** → "Thanks, noted."
4. Tap **Send forged webhook** (401) and **Replay last delivery** (duplicate, 0 sent).
5. Tap **Open secure page** → enter `120` → the agents re-run → **Everything verified, refund $215** → **Approve and save**.
6. Back in the console: the consented notification with no amounts, and all 16 steps of agent activity.

## Activating real channels

**Gemini:** set `GEMINI_API_KEY` (optionally `GEMINI_MODEL`). Untested here (no key): test the full demo, and watch that the model follows the delegation order. The server-side verification fallback still guards the reply.

**Photon iMessage (live):**
1. Create a project at app.photon.codes and get the project ID and secret. Provision an iMessage line (group features need a dedicated line).
2. Register the webhook URL `https://<your-app>/api/photon/webhook` and copy the webhook signing secret.
3. Set `SPECTRUM_PROJECT_ID`, `SPECTRUM_PROJECT_SECRET` and `SPECTRUM_WEBHOOK_SECRET`. Demo endpoints then turn off automatically (re-enable with `ENABLE_AGENT_DEMO=1`).
4. Replace the in-memory store with a Supabase-backed repository (service role key server-side only) using `supabase/migrations/*_agents.sql`, because serverless instances don't share memory.
5. Proactive (not reply) notifications: confirm the "create DM / connection and routing" API in Photon's docs and implement it in `notify()`. Live mode currently only replies to inbound messages.
6. Set `MEMORY_ENCRYPTION_KEY` (32 bytes base64), `SECURE_LINK_SECRET` and `APP_URL`. Production refuses to start these features without the first two.

## Limitations and risks
- Live Photon and Gemini paths are implemented against the official SDK APIs but **not tested** (no credentials).
- The agent store is in-memory per server instance. Fine for local demos, not for multi-instance production (see step 4).
- Document intelligence parses text. Real W-2 images go through the existing Gemini `/api/w2-extract` route, which isn't yet wired into the agent's document tool.
- The scope is the same as the Tax Assistant: single filer, W-2 wages, standard deduction, 2025.
- Rate limits are per instance. Use Vercel's firewall for hard limits.
