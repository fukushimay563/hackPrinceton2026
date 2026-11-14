# FirstFunds — Implementation plan & demo script

## Where we are (spec section → status)

| Spec § | Item | Status |
|---|---|---|
| 1 | One audience, one unified journey | ✅ Stepper nav, shared store, "Next" links, cross-step references |
| 2 | Credit card simulator (top priority) | ✅ Done, including utilization education without score predictions |
| 2/7 | Capital One Nessie | 🟡 Adapter built, **untested against the live API**. Needs keys + a seeded sandbox account |
| 3 | Guided tax flow, TY2025 rules, flags, Free File links | ✅ Done |
| 3 | Form 1040 PDF | 🟡 Review *worksheet* PDF (watermarked). Filling the official IRS fillable 1040 isn't done yet |
| 4 | Maya persona + Try Demo, no personal info | ✅ Done |
| 5 | Context-aware tutor, citations, no invented rules | ✅ Done (Gemini + offline fallback) |
| 5 | LangChain RAG over full IRS publications | ⬜ Current retrieval is a small in-house TF-IDF over 15 cited summaries |
| 6 | Shared data across steps | ✅ Paycheck → card (payment % of take-home) → taxes ("estimate from my paycheck") → tutor |
| 7 | Vultr / Tiger Data / domain | ⬜ Not started (only add if a prize requires it) |
| 8 | Next.js/React/TS/Tailwind, charts, responsive, a11y | ✅ Recharts; mobile tested at 390px. shadcn/ui wasn't installed (hand-built Tailwind components in the same style) |
| 10 | Demo runs without external dependencies | ✅ Offline tutor + bundled data |

## Who does what next (ordered by spec §12)

**Dev 1 — Simulator**
1. Add a "Pay in full each month" scenario card (shows $0 interest and the grace period).
2. Optional: daily-balance interest mode toggle (APR/365) for accuracy nerds.
3. Rehearse the slider moments for the demo (see script).

**Dev 2 — Taxes**
1. Download the official 2025 fillable Form 1040 from irs.gov, list its field names with pdf-lib `getForm().getFields()`, and map: wages, total income, AGI, standard deduction, taxable income, tax, withholding, refund/owed. **Check the 2025 line numbers** (OBBBA added deduction lines).
2. Keep the worksheet as the fallback.
3. Add more test cases (MFJ, HoH, $100k+ boundary, $0 wages).

**Dev 3 — AI & integrations**
1. Get a Gemini key into `.env.local`, then test the tutor + W-2 upload with a sample W-2 image (use the IRS sample, not a real one).
2. If a LangChain prize exists: ingest Pub 17, Pub 501 and the Form 1040 instructions (PDFs) into a vector store, and replace `retrieve()` in `src/lib/tutor/retrieve.ts`. Keep the API route contract (`{answer, sources, mode}`) unchanged.
3. Nessie: create customer → credit card account → ~12 purchases in the sandbox, set `NESSIE_ACCOUNT_ID`, and confirm the "Capital One Nessie sandbox" badge appears on /credit. Map Nessie merchant categories (currently round-robin placeholders).
4. Confirm the Gemini model name (`GEMINI_MODEL`); the default is `gemini-flash-latest`.

**Dev 4 — Frontend, deploy, demo**
1. Deploy to Vercel (or Vultr if it's a prize track). Set env vars there.
2. Record the backup demo video **with no API keys set** (offline mode), then again with Gemini.
3. Devpost write-up + screenshots.

## ⚠️ Verify before claiming any sponsor prize
I couldn't find the HackPrinceton Fall 2026 prize list online. Check the Devpost page or ask organizers about the requirements for Capital One, Gemini/Google, LangChain, Vultr, Tiger Data and the domain prize **before** building more integrations.

## 2-minute demo script

| Time | Action | Say |
|---|---|---|
| 0:00 | Home page | "Every year millions of 18–22-year-olds get their first paycheck, first credit card and first tax return in the same year, with no one explaining them. FirstFunds connects all three." |
| 0:15 | **Try Maya's demo journey** → Paycheck | "Maya earns $1,600 every two weeks. She takes home $1,327. Here's exactly where the rest went." |
| 0:30 | Next → Credit card | "She put $600 on a 24.99% card. Minimum payments: **2 years 10 months and $240 in interest**, 40% extra." Drag payment to $100: "7 months, $48. That's $192 saved." |
| 0:50 | Click **What if I keep spending like this?** | "If she keeps spending like October, the balance never goes down. She's stuck at her limit." Set spending back to 0. |
| 1:05 | Next → Taxes → Use Maya's W-2 → Continue ×5 | "Six steps with 2025 IRS rules: $15,750 standard deduction, Tax Table, **$383 refund**. We flag what we don't support, generate a draft 1040 worksheet, and link to IRS Free File. We never file." |
| 1:30 | **Ask tutor** → "Why am I paying so much interest if I only spent $600?" | "The tutor reads her actual numbers: APR ÷ 12, $12.50 the first month, minimum vs. $100, with CFPB and IRS citations." |
| 1:50 | Close | "Business model: B2B2C. Banks, credit unions and universities license FirstFunds for onboarding first-time cardholders and students. Next: state taxes, budgeting from real accounts, more personas." |

Backup: if Wi-Fi dies, everything above works offline (tutor shows "offline mode").
