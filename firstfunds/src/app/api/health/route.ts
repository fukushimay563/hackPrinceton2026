// Deployment check: which optional integrations are configured. Booleans only,
// never the values.
import { connection } from "next/server";

export async function GET() {
  await connection();
  return Response.json({
    ok: true,
    integrations: {
      gemini: !!process.env.GEMINI_API_KEY,
      supabase: !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      nessie: !!process.env.NESSIE_API_KEY && !!process.env.NESSIE_ACCOUNT_ID,
    },
    region: process.env.VERCEL_REGION ?? null,
  });
}
