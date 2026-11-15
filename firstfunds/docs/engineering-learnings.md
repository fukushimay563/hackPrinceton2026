# Engineering learnings: candidate ChatOverflow field notes

Sanitized notes from real obstacles hit while building FirstFunds. No credentials, personal data, tax records or proprietary details. Each was reproduced and its fix verified.

**ChatOverflow status (2026-11-14):** none of these are published. ChatOverflow wasn't reachable from the session that built this: no ChatOverflow MCP server was running on the linked Mac (`localMcpServers: []`), no ChatOverflow tool was available, and the connector directory had no match. The "does a similar note already exist?" check could not be run either. Publish through your team's configured ChatOverflow integration, after its approval step, and only then change a status below.

---

## 1. Deep Agents (JS) didn't register `write_todos` by default

1. **Title:** `createDeepAgent` (deepagents 1.16.x) has no planning tool unless you add the todo middleware.
2. **Problem:** The supervisor's `write_todos` call failed with "write_todos is not a valid tool, try one of [ls, read_file, write_file, edit_file, delete, glob, grep, execute, …]", even though the docs list planning as built in.
3. **Root cause:** In the installed version the todo-list middleware isn't part of the default stack. Only a prompt string mentions `write_todos`.
4. **Verified solution:** Pass `middleware: [todoListMiddleware()]` (from `langchain`) to `createDeepAgent`.
5. **Test evidence:** `tests/agents.test.ts`, "supervisor plans and delegates…", asserts six todos that end `completed`. A prototype before and after the change showed the error, then `Updated todo list to [...]`.
6. **Lesson:** Check which built-in tools your installed agent-framework version actually registers (call a tool and read the "valid tools" error) instead of trusting the overview docs.
7. **Status:** Not published.

## 2. System prompts reach custom chat models as content-block arrays

1. **Title:** In LangChain JS agents, `SystemMessage.content` can be an array of `{type:"text"}` blocks, so `String(content)` gives `[object Object]`.
2. **Problem:** A custom `BaseChatModel` that routed on markers in the system prompt never matched, and every subagent behaved like the default.
3. **Root cause:** The agent runtime builds system messages from content blocks, not plain strings.
4. **Verified solution:** Flatten the content: a string stays as-is, and an array becomes the joined `block.text` values (`contentText()` in `src/lib/agents/policyModel.ts`).
5. **Test evidence:** Debug output showed `system:[{"type":"text","text":"ROLE:supervisor"}]`. After the fix, all six subagents run their own tools (delegation test).
6. **Lesson:** Treat message `content` as `string | ContentBlock[]` everywhere, especially in custom models, middleware and logging.
7. **Status:** Not published.

## 3. Human-approval resume must target the same checkpoint thread

1. **Title:** Resuming a LangGraph human-in-the-loop interrupt on the wrong `thread_id` silently does nothing.
2. **Problem:** The user clicked "Approve and save", the record wasn't saved, and the UI said "you declined".
3. **Root cause:** The approval link carried the texting thread, but the run that paused was on a web thread. `invoke(new Command({resume}))` on a thread with no pending interrupt returns without error.
4. **Verified solution:** Put the thread id inside the encrypted approval link, continue the clarification run on that thread, and track a per-thread "awaiting approval" flag. Resuming without a pending interrupt now throws (HTTP 409) instead of silently passing.
5. **Test evidence:** The regression test "approval works when the secure link came from the text conversation" fails without the fix and passes with it. Browser run: "Saved to your record".
6. **Lesson:** Every human-approval link or button must carry, authenticated, the exact checkpoint thread it resumes. Treat "nothing to resume" as an error.
7. **Status:** Not published.

## 4. `useEffect(() => el.scrollIntoView())` crashes React in newer Chrome

1. **Title:** Chrome 153's `scrollIntoView()` and `scrollTo()` return Promises, so a concise-arrow effect hands React a non-function "cleanup".
2. **Problem:** The page crashed on load with "destroy is not a function" (minified: "i is not a function"). Dev mode warned "you returned a Promise".
3. **Root cause:** `useEffect(() => ref.current?.scrollIntoView({...}), deps)` implicitly returns the method's result. Scroll methods used to return `undefined`, but this browser returns a Promise.
4. **Verified solution:** Use a block body: `useEffect(() => { ref.current?.scrollIntoView(...); }, deps)`.
5. **Test evidence:** In Playwright on Chrome 153.0.8010.12, `scrollIntoView({behavior:"smooth"})` → `[object Promise]`. After the fix the Agent Console loads with no page errors.
6. **Lesson:** Never use concise arrows for effects that call DOM methods. Return values you didn't expect become cleanups. A lint rule enforcing block bodies in `useEffect` prevents this.
7. **Status:** Not published.

## 5. Photon/Spectrum webhook headers come from the SDK source, not the docs

1. **Title:** Native Spectrum webhooks are signed `X-Spectrum-Signature: v0=<hex HMAC-SHA256(secret, "v0:"+ts+":"+rawBody)>` with `X-Spectrum-Timestamp`.
2. **Problem:** The public webhook docs describe the signed string and the 5-minute replay window but don't name the headers or the encoding, which a custom verifier needs.
3. **Root cause:** A documentation gap. The SDK's verifier is the source of truth.
4. **Verified solution:** Use the SDK's portable export, `verifySpectrumSignature` plus `slimEnvelopeSchema` from `@spectrum-ts/core/webhook`, on the exact raw request bytes.
5. **Test evidence:** The webhook test accepts valid signatures and rejects forged (401), tampered (401), expired and missing-header (400) deliveries, plus a JSON body re-serialized with different whitespace. Live route: signed → 200, forged → 401, unsigned → 400.
6. **Lesson:** Verify webhooks over the raw bytes before parsing JSON, and prefer the vendor's own verifier export to re-implementing from prose docs.
7. **Status:** Not published.

## 6. Tool callbacks reach Deep Agents subagents, which is enough for an activity feed

1. **Title:** Callbacks passed to `invoke(..., { callbacks })` also fire for tools run inside `task`-delegated subagents.
2. **Problem:** We wanted a live "agent activity" view without exposing model reasoning.
3. **Root cause / finding:** Callback config propagates into subagent graphs, so `handleToolStart` sees `write_todos`, `task` (with `subagent_type`) and each subagent's own tools.
4. **Verified solution:** Build the timeline from tool-start events plus short summaries emitted by our own deterministic tools. No model text is shown.
5. **Test evidence:** The prototype logged `start:task` followed by `start:add` from the subagent. The delegation test asserts events from all six specialists.
6. **Lesson:** Audit trails and UIs can be built from tool-level events, which are actions and outcomes, instead of model reasoning.
7. **Status:** Not published.

## 7. LangGraph node names can't reuse state channel names

1. **Title:** `addNode("draft", …)` fails when the state annotation also has a `draft` channel.
2. **Problem:** Graph construction failed during tests.
3. **Root cause:** Node names and state keys share a namespace in LangGraph JS.
4. **Verified solution:** Rename the node (`build_draft`).
5. **Test evidence:** `tests/minimizer.test.ts` passed after the rename (14/14 at the time).
6. **Lesson:** Use verb names for nodes (`build_draft`) and noun names for state (`draft`).
7. **Status:** Not published.

## 8. Next.js 16 `cacheComponents` prerenders GET route handlers at build time

1. **Title:** With `cacheComponents: true`, a GET route handler that reads `process.env` is prerendered, freezing env values at build time.
2. **Problem:** `/api/nessie` showed as static (○), so runtime env vars would be ignored. Separately, `export const runtime = "nodejs"` broke the build under this config.
3. **Root cause:** Without a dynamic API call, the route counts as static. Some segment-config exports aren't allowed with `cacheComponents`.
4. **Verified solution:** Call `await connection()` from `next/server` at the top of the handler, and remove the `runtime` export.
5. **Test evidence:** Build output changed the route from ○ to ƒ, and `/api/health` reports runtime configuration correctly.
6. **Lesson:** After enabling `cacheComponents`, check the build's route table. Anything that reads env, headers or a database must be ƒ.
7. **Status:** Not published.

## 9. Testing Supabase row-level security without Docker

1. **Title:** Run real migrations in PGlite with a minimal stand-in `auth` schema to test RLS policies in CI.
2. **Problem:** We wanted proof that policies isolate tenants, without a running Supabase stack.
3. **Root cause / finding:** Policies only need the `anon`/`authenticated` roles and `auth.uid()`. A stub `auth.uid()` reading `current_setting('request.jwt.claim.sub')` plus `SET ROLE` is enough.
4. **Verified solution:** `tests/rls.test.ts` creates the roles and stub, applies every migration, then runs queries as each role.
5. **Test evidence:** 6 tests cover own-row access, anonymous denial, cross-tenant writes rejected, service-only tables, and constraints blocking SSNs and amounts in shared notes.
6. **Lesson:** RLS is just Postgres, so test it in-process. A WASM Postgres keeps those tests fast and dependency-free.
7. **Status:** Not published.

## 10. A single-file artifact host rejected literal U+FFFD characters in the bundle

1. **Title:** Inlined JS bundles can contain literal U+FFFD (inside regexes and string tables), which some upload validators reject as broken UTF-8.
2. **Problem:** Publishing the single-file build failed with "U+FFFD at line 269".
3. **Root cause:** Library code (character-range regexes, encoding tables) contains the character literally.
4. **Verified solution:** A post-build step replaces each literal with the `�` escape, which is equivalent inside string, template and regex literals. All 4 occurrences were checked to be in those contexts.
5. **Test evidence:** Re-ran the full browser walkthrough on the rebuilt file with no errors, then published.
6. **Lesson:** After inlining a bundle, scan for non-ASCII "replacement" characters and escape them in string or regex contexts.
7. **Status:** Not published.

## 11. Keyword intent routers need word boundaries

1. **Title:** `/xp/` matched "e**xp**lain", sending lesson questions to the wrong help article.
2. **Problem:** "Can you explain more about tax brackets?" returned the Academy help text.
3. **Root cause:** Substring regexes for short keywords.
4. **Verified solution:** `\b(…)\b` around short keywords. "Explain" questions are now routed to the lesson.
5. **Test evidence:** Spot-check script outputs before and after the fix.
6. **Lesson:** Short keywords (xp, id, ai) need word boundaries, and every keyword router should be tested with near-miss words.
7. **Status:** Not published.
