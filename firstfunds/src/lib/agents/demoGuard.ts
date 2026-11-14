// The demo driver endpoints only exist in mock mode (or when explicitly enabled).
import { photonMode } from "../photon/transport";

export function demoEnabled() {
  return photonMode() === "mock" || process.env.ENABLE_AGENT_DEMO === "1";
}

export function notFound() {
  return Response.json({ error: "Not found" }, { status: 404 });
}

/** Demo-only chat transcript (both directions) so the console survives navigation. */
export type DemoBubble = { from: "user" | "finpilot" | "system"; text: string; at: number; status?: string };
const g = globalThis as unknown as { __ffDemoChat?: DemoBubble[]; __ffDemoRun?: { run: unknown } };
export const demoChat: DemoBubble[] = (g.__ffDemoChat ??= []);
const lastRunBox = (g.__ffDemoRun ??= { run: null });
export function resetDemoChat() {
  demoChat.length = 0;
  lastRunBox.run = null;
}
/** Latest supervisor run, so the console can show it after navigating away. */
export function setDemoRun(run: unknown) {
  if (demoEnabled() && run) lastRunBox.run = run;
}
export function demoRun() {
  return lastRunBox.run;
}
