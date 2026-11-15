// Deployment check: which optional integrations are configured. Booleans only,
// never the values. Add ?check=gemini to make one tiny live Gemini call.
import { connection } from "next/server";
import { geminiBackend, geminiConfigured, geminiModelInfo, pingGemini } from "@/lib/server/gemini";
import { agentMode } from "@/lib/agents/supervisor";
import { photonConfigProblems, photonMode } from "@/lib/photon/transport";
import { parseDemoNumbers } from "@/lib/photon/handles.mjs";
import { bankingStore } from "@/lib/banking/repository";
import { SupabaseBankingStore, supabaseServerConfig } from "@/lib/banking/supabaseStore";
import { DEFAULT_NESSIE_BASE_URL, nessieConfigFromEnv, nessieConfigProblems, pingNessie } from "@/lib/banking/nessie";

export async function GET(req: Request) {
  await connection();
  const check = new URL(req.url).searchParams.get("check");
  const model = geminiModelInfo();
  const demo = parseDemoNumbers(process.env.PHOTON_DEMO_NUMBERS);
  return Response.json({
    ok: true,
    integrations: {
      gemini: geminiConfigured(),
      geminiBackend: geminiBackend(),
      geminiModel: model.model,
      geminiModelSource: model.source, // "GEMINI_MODEL" = env var read at runtime; "fallback" = not set in this deployment's environment
      ...(model.warning ? { geminiModelWarning: model.warning } : {}),
      agents: agentMode(),
      supabase: !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      nessie: !!process.env.NESSIE_API_KEY,
      bankingStorage: {
        backend: bankingStore().backend, // "supabase" = persistent; "memory" = one server instance only
        serverKeyConfigured: !!supabaseServerConfig(), // true/false only, never the key
      },
      nessieApi: {
        // Host only (never the key). "v2" when it's the Nessie v2 API host.
        host: hostOf(process.env.NESSIE_BASE_URL?.trim() || DEFAULT_NESSIE_BASE_URL),
        problems: process.env.NESSIE_API_KEY ? nessieConfigProblems() : [],
      },
      // Counts and setting names only, never numbers or secrets.
      photon: {
        mode: photonMode(),
        problems: photonMode() === "live" ? photonConfigProblems() : [],
        demoNumbersConfigured: demo.handles.size,
        demoNumbersInvalid: demo.invalid,
      },
    },
    ...(check === "gemini" ? { geminiCheck: await pingGemini() } : {}),
    ...(check === "nessie" ? { nessieCheck: await nessieCheck() } : {}),
    ...(check === "banking" ? { bankingCheck: await bankingCheck() } : {}),
    region: process.env.VERCEL_REGION ?? null,
    // Which build is answering: compare with the commit you expect to be live.
    deployment: {
      env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null,
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      staticBuild: process.env.NEXT_PUBLIC_STATIC === "1",
    },
  }, { headers: { "cache-control": "no-store" } });
}

/** One live read-only call (GET /accounts?limit=1): proves auth + connectivity, reports whether data exists. */
async function nessieCheck() {
  const cfg = nessieConfigFromEnv();
  if (!cfg) return { ok: false, reason: "NESSIE_API_KEY is not set." };
  const r = await pingNessie(cfg);
  return {
    ...r,
    host: hostOf(cfg.baseUrl),
    result: !r.ok ? "error" : r.accounts ? "ok (sandbox has accounts)" : "empty (connected; sandbox has no accounts yet)",
  };
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "(invalid NESSIE_BASE_URL)";
  }
}

/** Live database round trip (write + read back) and schema check. Touches no user data. */
async function bankingCheck() {
  const store = bankingStore();
  if (!(store instanceof SupabaseBankingStore)) {
    return { ok: false, backend: store.backend, reason: "Supabase server credentials are not set, so banking records are NOT persistent (per-instance memory)." };
  }
  const t = Date.now();
  try {
    const r = await store.ping();
    const schema = (r.schema ?? {}) as Record<string, boolean>;
    const missing = Object.entries(schema).filter(([, v]) => !v).map(([k]) => k);
    return { ok: r.roundTrip === true && missing.length === 0, backend: "supabase", roundTrip: r.roundTrip === true, ms: Date.now() - t, schema, missing };
  } catch (e) {
    return { ok: false, backend: "supabase", ms: Date.now() - t, reason: e instanceof Error ? e.message : "Database check failed" };
  }
}
