// Deployment check: which optional integrations are configured. Booleans only,
// never the values. Add ?check=gemini to make one tiny live Gemini call.
import { connection } from "next/server";
import { geminiBackend, geminiConfigured, geminiModelInfo, pingGemini } from "@/lib/server/gemini";
import { agentMode } from "@/lib/agents/supervisor";
import { photonConfigProblems, photonMode } from "@/lib/photon/transport";
import { parseDemoNumbers } from "@/lib/photon/handles.mjs";

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
      // Counts and setting names only, never numbers or secrets.
      photon: {
        mode: photonMode(),
        problems: photonMode() === "live" ? photonConfigProblems() : [],
        demoNumbersConfigured: demo.handles.size,
        demoNumbersInvalid: demo.invalid,
      },
    },
    ...(check === "gemini" ? { geminiCheck: await pingGemini() } : {}),
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
