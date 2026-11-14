// Human-in-the-loop decision for the approval-gated `save_verified_estimate` action.
// Authorized by the same encrypted link token (tenant from the token only).
import { DEMO_PHONE } from "@/lib/agents/documents";
import { verifyLink } from "@/lib/agents/secureLink";
import { store } from "@/lib/agents/store";
import { NothingToApproveError, runSupervisor } from "@/lib/agents/supervisor";
import { notify } from "@/lib/photon/handler";
import { mockSender, photonMode } from "@/lib/photon/transport";
import { rateLimit } from "@/lib/server/rateLimit";
import { demoChat, demoEnabled, demoRun, setDemoRun } from "@/lib/agents/demoGuard";

export async function POST(req: Request) {
  const limited = rateLimit(req, "agent-approve", 20, 60_000);
  if (limited) return limited;
  const body = (await req.json().catch(() => ({}))) as { token?: string; decision?: string };
  const v = typeof body.token === "string" ? verifyLink(body.token) : null;
  if (!v?.ok) return Response.json({ error: "This link is invalid or has expired." }, { status: 401 });
  if (body.decision !== "approve" && body.decision !== "reject") return Response.json({ error: "decision must be approve or reject" }, { status: 400 });
  const tenant = v.claims.tenant;
  const thread = v.claims.thread && v.claims.thread.startsWith(`${tenant}:`) ? v.claims.thread : `${tenant}:web`;
  let run;
  try {
    run = await runSupervisor({ tenant, threadId: thread, channel: "web", resume: body.decision });
  } catch (e) {
    if (e instanceof NothingToApproveError) return Response.json({ error: e.message }, { status: 409 });
    throw e;
  }

  // Consent-based notification (mock transport here; live proactive sends need the
  // Spectrum "connection and routing" setup — see docs/AGENTS.md).
  let notification: unknown = { status: "not-sent" };
  if (run.status === "saved") {
    const phone = [DEMO_PHONE].find((p) => store.phoneLink(p)?.tenant === tenant);
    notification = phone ? (photonMode() === "mock" ? await notify(phone, "estimate-saved", run.runId, mockSender()) : { status: "live-proactive-not-enabled" }) : { status: "no-linked-phone" };
  }
  // Keep the console's last full result, adding the approval outcome.
  const prev = demoRun() as { events?: unknown[] } | null;
  if (prev) setDemoRun({ ...prev, status: run.status, reply: run.reply, events: [...(prev.events ?? []), ...run.events.map((e, i) => ({ ...e, seq: (prev.events?.length ?? 0) + i + 1 }))] });
  const n = notification as { status?: string; text?: string };
  if (demoEnabled() && n.status === "sent" && n.text) demoChat.push({ from: "finpilot", text: n.text, at: Date.now(), status: "sent (notification, consented)" });
  return Response.json({ run, notification });
}
