# FirstFunds

**Your first paycheck, first credit card and first tax return, explained.**
HackPrinceton Fall 2026 · Business & Enterprise.

| Feature | Route | What it does |
|---|---|---|
| **Financial Advisor** | `/advisor`, `/paycheck`, `/credit` | Money snapshot with rule-based next steps, paycheck breakdown + 50/30/20 budget, animated credit card simulator |
| **Tax Assistant** | `/taxes` (`/taxes/classic`) | 2025 federal return estimate that asks the fewest questions: reads the W-2, confirms it, asks only what's missing, checks everything, needs your approval |
| **Financial Advisory Academy** | `/academy` | 10 lessons for first-time taxpayers (3 modules) with interactive examples driven by the real tax engine, quizzes, XP and badges |
| **FinPilot AI Assistant** | `/finpilot` + "Ask FinPilot" on every page | Support chatbot: money/tax questions with the user's own numbers and IRS/CFPB citations, plus help using the app |
| **FinPilot Deep mode** | `/agents` (Agent Console) | Text FinPilot over **Photon 2.0** (iMessage). A **LangChain Deep Agents** supervisor delegates to 6 specialists, verifies, and asks for approval before saving. See `docs/AGENTS.md` |

Everything works with **no keys at all** (sample data, offline FinPilot, progress saved in the tab). Add keys to turn on Gemini, Supabase accounts and Capital One Nessie.

## Run locally

```bash
npm install
cp .env.example .env.local   # optional
npm run dev                  # http://localhost:3000
npm test                     # 54+ tests: engines, question minimizer, Academy, hometown/cross-border tax, agents/Photon/security, database RLS
```

Requires Node 20.9+.

## Deploy to Vercel

1. Push this folder to a GitHub repo.
2. In Vercel: **Add New → Project → Import** the repo. The framework is detected as Next.js; keep the defaults.
3. Add environment variables (Settings → Environment Variables), all optional:
   - `GEMINI_API_KEY` (FinPilot answers + W-2 reading), optional `GEMINI_MODEL`
   - Supabase variables (see below; the Supabase integration adds them automatically)
   - `NESSIE_API_KEY`, `NESSIE_ACCOUNT_ID`
4. Deploy. Open `https://<your-app>.vercel.app/api/health` to see which integrations are on (it shows true/false only, never values).

CLI alternative: `npx vercel` then `npx vercel --prod`.

`vercel.json` sets 30-second limits for the two Gemini routes and basic security headers. The AI routes have a per-IP rate limit (20/min for FinPilot, 8/min for W-2 reading). It's in-memory per function instance, so for a hard limit add Vercel's firewall rate limiting.

## Connect Supabase (accounts + saved progress)

Optional. Without it, progress lives in the browser tab only.

**1. Environment variables.** Either install the **Supabase integration from the Vercel Marketplace** (it creates the project's env vars for you), or add them by hand:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...   # or NEXT_PUBLIC_SUPABASE_ANON_KEY on older projects
```

The app only uses the public key. Never put the service-role/secret key in a `NEXT_PUBLIC_` variable.

**2. Database.** Run `supabase/migrations/20261114000000_firstfunds.sql`, either pasted into the Supabase **SQL Editor**, or with the CLI:

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

It creates `filing_profiles` and `academy_progress`, one row per user, with row-level security so each signed-in user can only read and write their own row. Signed-out visitors can't read anything. These rules are tested against a real Postgres engine in `tests/rls.test.ts`.

**3. Auth settings** (Supabase → Authentication):
- **Providers → Email**: enabled (magic links, no passwords).
- **URL Configuration → Site URL**: your Vercel URL.
- **Redirect URLs**: `https://<your-app>.vercel.app/account`, `http://localhost:3000/account`, and for preview deploys `https://*-<your-team>.vercel.app/**`.
- Optional: **Sign In / Providers → Anonymous sign-ins** on, to enable "Continue as a guest".

Sign-in links must be opened in the same browser that requested them (PKCE).

**What's stored:** Tax Assistant answers and the box values read from documents (no files, SSNs or full employer IDs), and Academy lesson scores. Users can delete their data from `/account`; deleting a user in Supabase deletes their rows too.

## How the pieces fit

```
src/lib/finance/        credit.ts · tax2025.ts · paycheck.ts      pure, tested engines (TY2025 IRS figures)
src/lib/minimizer/      registry · engine · documents · graph (LangGraph) · persist · cloud (Supabase)
src/lib/academy/        lessons.ts (content + sources) · progress.ts (local + Supabase sync)
src/lib/tutor/          FinPilot: corpus (IRS/CFPB + help articles + lessons) · retrieve · offline answers · ask
src/lib/supabase/       browser client + session hook (no-ops when not configured)
src/lib/server/         rate limiting for API routes
src/app/(journey)/      advisor · paycheck · credit · taxes · academy · finpilot · account
src/app/api/            tutor (Gemini) · w2-extract (Gemini vision) · nessie · health
supabase/migrations/    tables + row-level security
web/                    single-file build of the same app (`npm run build:static`)
```

**Tax Assistant design:** Gemini only reads documents (server-side, schema-validated output, document text treated as data). Required questions, validation, scope checks and arithmetic are deterministic code. Every figure on the draft shows its source (document box or the user's answer) and the IRS rule behind it. The draft is ready only when all required answers are in, documents are confirmed, conflicts are resolved and the calculation re-checks. Out-of-scope situations (freelance income, married, dependents, tips/overtime, other income) get an explanation instead of a wrong number.

**Academy accuracy:** `tests/academy.test.ts` checks that lesson amounts (standard deduction, brackets, Social Security wage base) match the tax engine, quiz answers are valid, and every lesson cites IRS.gov.

## Tax figures used (verify before changing)

- Standard deduction 2025: $15,750 single/MFS · $31,500 MFJ · $23,625 HoH (P.L. 119-21)
- Dependent: greater of $1,350 or earned income + $450, capped at the regular amount
- Brackets: Rev. Proc. 2024-40 · taxable income < $100k uses the IRS Tax Table
- Social Security wage base 2025: $176,100

Maya check: $41,600 wages − $15,750 = $25,850 taxable → $2,867 tax → $3,250 withheld → **$383 refund**.

*Educational guidance only. FirstFunds isn't a licensed financial advisor or tax preparer and doesn't file tax returns.*
