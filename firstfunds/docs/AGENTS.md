# FinPilot Deep Mode: Deep Agents + Photon 2.0

## Audit summary (Phase 1)

| Area | What exists |
|---|---|
| Stack | Next.js 16.4 (App Router, `cacheComponents`), React 19.3, TypeScript, Tailwind 4, Node ≥ 22 |
| Existing AI | FinPilot (`/api/tutor`, Gemini + offline fallback), W-2 reading (`/api/w2-extract`, Gemini), LangGraph tax question flow (`src/lib/minimizer`) |
| Calculation | Deterministic, tested `src/lib/finance/tax2025.ts` (TY2025, IRS Tax Table) |
| Research | Cited IRS/CFPB corpus (`src/lib/tutor/corpus.ts`) |
| Auth | Optional Supabase (magic link / guest), RLS-protected tables |
| Security before this work | Per-IP rate limits, schema-validated extraction, no logging of documents |

**Integration plan:** add a new `src/lib/agents` module and `src/lib/photon` module, reuse the existing tax engine and IRS corpus, and add new routes and pages. No existing feature was removed.

## Architecture

```
iMessage ─► Photon 2.0 (Beta) ─► POST /api/photon/webhook   (event: message.received)
                                  │ 1. verify Standard Webhooks signature (whsec_ key, raw bytes, 5-min window, event id = webhook-id)
                                  │ 2. dedupe on the Photon message id   3. ack 200   4. after(): handleInbound
                                  ▼
                        src/lib/photon/handler.ts
          linked phone? consent (STOP/START)? pending question? → tenant + thread
                                  ▼
                 Deep Agents supervisor (src/lib/agents/supervisor.ts)
   write_todos ─ task→document ─ task→research ─ task→calculation ─ task→verification ─ task→planning ─ task→communication
                                  │                   (deterministic tools in specialists.ts)
                save_verified_estimate ◄── interruptOn: human approval required
                                  ▼
          reply = communication agent output (verified-only, message-safe)
                 ─► POST https://api.photon.codes/v1/projects/{id}/messages (Bearer pho_sk_, idempotency-key)
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
- **Photon 2.0 (Beta):** `live` when `PHOTON_PROJECT_ID`, `PHOTON_API_KEY` and `PHOTON_WEBHOOK_SECRET` are all set, otherwise `mock`. Mock uses the same verifier and `message.received` payload shape with a local secret, and records replies instead of sending. It's labeled "MOCK mode" in the UI and API. A production deployment without the three settings rejects webhook deliveries (503) instead of silently running mock mode (override for demos: `ENABLE_AGENT_DEMO=1`).

## Security controls (Phase 4)

| Control | Where |
|---|---|
| Webhook authentication | `transport.ts` → `verifyStandardWebhook` (HMAC-SHA256 over `id.timestamp.rawBody`, constant-time compare, 5-min window, signed id must equal the event id). Only `message.received` from a human to our agent line in a **direct** space is processed; group chats and our own outbound echoes are ignored |
| Idempotency | Inbound: `store.claimEvent(<Photon message id>)`. Outbound: outbox keys (`reply:<messageId>`, `notify:<kind>:<runId>`) sent as Photon `idempotency-key: firstfunds:<key>`, so retries never double-send; DB: `photon_events` primary key, `message_outbox` |
| Secrets | `PHOTON_API_KEY` and `PHOTON_WEBHOOK_SECRET` are read server-side only. Errors are logged as status + problem code + request id; config problems name the setting, never the value |
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
npm test                    # 81 tests (6 files)
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

**Photon iMessage (live, Photon 2.0 Beta):**

How texts are routed (`src/lib/photon/handler.ts`):
- **General money/tax questions** ("what is a W-2?", "how does APR work?") from any number → **FinPilot** (`src/lib/tutor/answer.ts`, the same engine as the web chat) with **no personal context and no banking tools**. Plain text, citation markers removed, up to 2 source links. Public rule amounts (e.g. the standard deduction) are allowed; identifiers never are.
- **Questions about the asker's own return** (my refund / W-2 / status / estimate) or an answer to a pending question → the **Deep Agents supervisor**, linked numbers only. Unlinked numbers get the link prompt.
- `STOP` / `START` / `HELP` work for every number, linked or not. Numbers in `PHOTON_DEMO_NUMBERS` are linked to the **synthetic demo taxpayer** (replies say "Demo data") with notifications off.
- Replies go out from the line that received the message, threaded to it (`parentMessageId`). Approved-estimate notifications go only to opted-in, non-stopped users, into their existing direct conversation.

Activation:
1. In the **Photon Beta dashboard** (app.beta.photon.codes), open the project. Copy the project ID (`pho_prj_...`) from **Settings**.
2. **API keys → New API key** with `project:read` and `project:write`. Copy the `pho_sk_...` key (shown once).
3. **iMessage**: assign a shared iMessage line to the project. That number is FinPilot's number. (Beta shared lines: direct chats only, text and images.)
4. Deploy the app to a public HTTPS URL (e.g. Vercel). In the deployment's environment set `PHOTON_PROJECT_ID`, `PHOTON_API_KEY`, `MEMORY_ENCRYPTION_KEY`, `SECURE_LINK_SECRET`, `APP_URL` (and optionally `PHOTON_DEMO_NUMBERS`).
5. Add a **webhook destination**: URL `https://<your-domain>/api/photon/webhook`, event `message.received`. Copy its signing secret (`whsec_...`) into `PHOTON_WEBHOOK_SECRET`, then redeploy.
6. Locally, with the same values in `.env.local`: `node scripts/check-photon.mjs https://<your-domain>`. It checks the key against the project and that the webhook destination exists, is enabled, receives `message.received` and points at your deployment. It never prints secrets.
7. Text the line from your phone: "what is a W-2?" (FinPilot) and, from a demo number, "is my return ready?" (agents).
8. For multi-instance production, replace the in-memory store with a Supabase-backed repository (service role key server-side only) using `supabase/migrations/*_agents.sql`, because serverless instances don't share memory (dedupe, phone links, outbox).

## Limitations and risks
- The live Photon 2.0 path is built on the official `@photon-ai/api` client and tested against the documented request/response shapes and the Standard Webhooks test vector, but **not against a live project** (no credentials here). The Gemini path is likewise untested without a working key.
- The agent store is in-memory per server instance. Fine for local demos, not for multi-instance production (see step 4).
- Document intelligence parses text. Real W-2 images go through the existing Gemini `/api/w2-extract` route, which isn't yet wired into the agent's document tool.
- The scope is the same as the Tax Assistant: single filer, W-2 wages, standard deduction, 2025.
- Rate limits are per instance. Use Vercel's firewall for hard limits.
