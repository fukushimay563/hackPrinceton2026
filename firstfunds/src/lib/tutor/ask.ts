"use client";
import { useApp } from "../store";
import { buildTutorContext } from "./context";
import { IS_STATIC } from "../runtime";
import { gatherSources } from "./sources";
import { offlineAnswer, OFFLINE_FALLBACK } from "./offline";

/** Send a question to the tutor using the live app state. Safe to call from any page. */
export async function askTutorQuestion(question: string, page: string) {
  const q = question.trim();
  const s = useApp.getState();
  if (!q || s.tutorLoading) return;
  const history = s.chat.slice(-6).map(({ role, content }) => ({ role, content }));
  s.pushChat({ role: "user", content: q });
  s.setTutorStatus(true, null);
  try {
    const context = buildTutorContext({ paycheck: s.paycheck, card: s.card, tax: s.tax, page, hasProfile: !!s.profile });
    if (IS_STATIC) {
      // Hosted single-page build: no server, so answer in the browser from the cited corpus.
      await new Promise((ok) => setTimeout(ok, 400));
      const sources = gatherSources(q);
      const answer = offlineAnswer(q, context, sources);
      useApp.getState().pushChat({
        role: "assistant",
        content: answer,
        sources: answer === OFFLINE_FALLBACK ? [] : sources.map((d) => ({ title: d.title, url: d.url })),
        mode: "offline",
      });
      useApp.getState().setTutorStatus(false, null);
      return;
    }
    const res = await fetch("/api/tutor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q, context, history }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Something went wrong");
    useApp.getState().pushChat({ role: "assistant", content: data.answer, sources: data.sources, mode: data.mode });
    useApp.getState().setTutorStatus(false, null);
  } catch (e) {
    useApp.getState().setTutorStatus(false, e instanceof Error ? e.message : "The tutor couldn't answer. Try again.");
  }
}
