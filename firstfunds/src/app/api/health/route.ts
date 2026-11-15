// Deployment check: which optional integrations are configured. Booleans only,
// never the values. Add ?check=gemini to make one tiny live Gemini call.
import { connection } from "next/server";
import { geminiBackend, geminiConfigured, geminiModel, pingGemini } from "@/lib/server/gemini";

export async function GET(req: Request) {
  await connection();
  const check = new URL(req.url).searchParams.get("check");
  return Response.json({
    ok: true,
    integrations: {
      gemini: geminiConfigured(),
      geminiBackend: geminiBackend(),
      geminiModel: geminiModel(),
      supabase: !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      nessie: !!process.env.NESSIE_API_KEY,
    },
    ...(check === "gemini" ? { geminiCheck: await pingGemini() } : {}),
    region: process.env.VERCEL_REGION ?? null,
  });
}
