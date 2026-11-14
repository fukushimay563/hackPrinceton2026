// Read-only demo state for the dashboard: transcript, audit trail, memory counts.
// Never returns document text, identifiers or decrypted memory payloads.
import { connection } from "next/server";
import { DEMO_TENANT } from "@/lib/agents/documents";
import { demoChat, demoEnabled, demoRun, notFound } from "@/lib/agents/demoGuard";
import { agentMode } from "@/lib/agents/supervisor";
import { photonMode } from "@/lib/photon/transport";
import { store } from "@/lib/agents/store";

export async function GET() {
  await connection();
  if (!demoEnabled()) return notFound();
  const mem = store.recall(DEMO_TENANT);
  const counts: Record<string, number> = {};
  for (const m of mem) counts[m.kind] = (counts[m.kind] ?? 0) + 1;
  const saved = store.savedEstimate(DEMO_TENANT);
  return Response.json({
    modes: { agents: agentMode(), photon: photonMode() },
    seeded: !!store.phoneLink("+15555550123"),
    chat: demoChat,
    lastRun: demoRun(),
    audit: store.auditLog(DEMO_TENANT).slice(-25).map((a) => ({ at: a.at, actor: a.actor, action: a.action })),
    memory: counts,
    saved: saved ? { taxYear: saved.taxYear, approvedAt: saved.approvedAt } : null,
    answers: store.answers(DEMO_TENANT),
  });
}
