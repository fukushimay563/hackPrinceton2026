// Secure clarification page backend. Authorization = the encrypted, expiring link
// token; the tenant comes ONLY from the token, never from the request body.
import { connection } from "next/server";
import { extractDocument } from "@/lib/agents/documents";
import { log } from "@/lib/agents/logger";
import { verifyLink } from "@/lib/agents/secureLink";
import { store } from "@/lib/agents/store";
import { runSupervisor } from "@/lib/agents/supervisor";
import { setDemoRun } from "@/lib/agents/demoGuard";
import { rateLimit } from "@/lib/server/rateLimit";

const FIELD_LABEL: Record<string, string> = { federalWithheld: "Box 2 · Federal income tax withheld" };

function authorize(token: unknown) {
  if (typeof token !== "string" || token.length > 2000) return null;
  const v = verifyLink(token);
  return v.ok ? v.claims : null;
}

export async function GET(req: Request) {
  await connection();
  const claims = authorize(new URL(req.url).searchParams.get("token"));
  if (!claims) return Response.json({ error: "This link is invalid or has expired." }, { status: 401 });
  const doc = claims.docId ? store.documents(claims.tenant).find((d) => d.id === claims.docId) : null;
  return Response.json({
    purpose: claims.purpose,
    field: claims.field ? { key: claims.field, label: FIELD_LABEL[claims.field] ?? claims.field } : null,
    document: doc ? { fileName: doc.fileName, synthetic: doc.synthetic } : null,
    expiresAt: claims.exp * 1000,
    saved: !!store.savedEstimate(claims.tenant),
  });
}

export async function POST(req: Request) {
  const limited = rateLimit(req, "agent-clarify", 20, 60_000);
  if (limited) return limited;
  const body = (await req.json().catch(() => ({}))) as { token?: string; value?: unknown };
  const claims = authorize(body.token);
  if (!claims || claims.purpose !== "clarify-field" || claims.field !== "federalWithheld" || !claims.docId) {
    return Response.json({ error: "This link is invalid or has expired." }, { status: 401 });
  }
  // Input validation: a non-negative amount that can't exceed the document's wages.
  const value = typeof body.value === "number" ? body.value : Number(body.value);
  const doc = store.documents(claims.tenant).find((d) => d.id === claims.docId);
  if (!doc) return Response.json({ error: "Document not found." }, { status: 404 });
  const wages = extractDocument(doc).fields.wages?.value ?? Infinity;
  if (!Number.isFinite(value) || value < 0 || value > wages || Math.round(value * 100) !== value * 100) {
    return Response.json({ error: "Enter the amount in box 2 (0 or more, no more than the wages in box 1)." }, { status: 422 });
  }
  store.setOverride(claims.tenant, claims.docId, "federalWithheld", value); // user action, audited
  log("info", "clarify.field.provided", { field: claims.field });
  // Continue on the conversation the link came from, so a later approval resumes the same run.
  const thread = claims.thread && claims.thread.startsWith(`${claims.tenant}:`) ? claims.thread : `${claims.tenant}:web`;
  const run = await runSupervisor({ tenant: claims.tenant, threadId: thread, request: "The taxpayer provided the missing box 2 value through the secure link.", channel: "web" });
  setDemoRun(run);
  return Response.json({ run });
}
