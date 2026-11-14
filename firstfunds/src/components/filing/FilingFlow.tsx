"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Cloud, Loader2, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";
import { step, type StepResult } from "@/lib/minimizer/graph";
import { clearProfile, loadProfile, saveProfile } from "@/lib/minimizer/persist";
import { loadCloudProfile, pickNewer, saveCloudProfile } from "@/lib/minimizer/cloud";
import { emptyProfile } from "@/lib/minimizer/engine";
import { useSession } from "@/lib/supabase/useSession";
import type { FilingEvent } from "@/lib/minimizer/types";
import { useApp } from "@/lib/store";
import { askTutorQuestion } from "@/lib/tutor/ask";
import { cn } from "@/components/ui";
import { QuestionCard } from "./QuestionCard";
import { ConfirmDoc, DocumentsStep } from "./DocumentsStep";
import { ApprovedStep, EstimateStep, Notices, UnsupportedStep, VerifyStep } from "./ReviewSteps";

const PHASES = ["Basics", "Documents", "Questions", "Review"] as const;
const phaseIndex: Record<string, number> = { basics: 0, documents: 1, confirm: 1, questions: 2, verify: 3, estimate: 3, approved: 3, unsupported: 3 };

export function FilingFlow() {
  const [res, setRes] = useState<StepResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [saveState, setSaveState] = useState<"tab" | "saving" | "account" | "error">("tab");
  const auth = useSession();
  const signedIn = !!auth.session;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loaded = useRef(false);

  // Resume: newest of this tab's copy and (if signed in) the account copy.
  useEffect(() => {
    if (auth.loading || loaded.current) return;
    loaded.current = true;
    (async () => {
      const local = loadProfile();
      let saved = local;
      if (signedIn) {
        const cloud = await loadCloudProfile();
        if (cloud.ok) {
          saved = pickNewer(local, cloud.data);
          setSaveState("account");
        } else setSaveState("error");
      }
      const r = await step(saved);
      setRes(r);
      if (saved && saved.revision > 0) setStarted(true);
    })();
  }, [auth.loading, signedIn]);

  const persist = useCallback(
    (profile: StepResult["profile"]) => {
      const stamped = { ...profile, savedAt: Date.now() };
      saveProfile(stamped);
      if (!signedIn) return setSaveState("tab");
      setSaveState("saving");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        const r = await saveCloudProfile(stamped);
        setSaveState(r.ok ? "account" : "error");
      }, 400);
    },
    [signedIn],
  );

  const sync = useCallback((r: StepResult) => {
    persist(r.profile);
    // Share the verified numbers with the rest of the app (tutor context).
    const c = r.analysis.calc;
    if (c && r.analysis.calcValid) {
      useApp.getState().setTax({
        filingStatus: "single",
        wages: c.grossIncome,
        federalWithheld: c.withholding,
        canBeClaimedAsDependent: r.profile.answers["dependent.claimable"]?.value === "yes",
      });
    }
  }, [persist]);

  const send = useCallback(
    async (e: FilingEvent, busyMsg?: string) => {
      if (!res) return;
      if (busyMsg) setBusy(busyMsg);
      const [r] = await Promise.all([step(res.profile, e), busyMsg ? new Promise((ok) => setTimeout(ok, 650)) : null]);
      setRes(r);
      sync(r);
      setBusy(null);
      setEditing(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [res, sync],
  );

  const restart = async () => {
    clearProfile();
    if (signedIn) persist(emptyProfile()); // clears the account copy too
    const r = await step(null);
    setRes(r);
    setEditing(null);
    setStarted(false);
  };

  if (!res)
    return (
      <Shell>
        <div className="flex items-center gap-2 py-20 text-ink-3">
          <Loader2 className="animate-spin" size={18} /> Loading…
        </div>
      </Shell>
    );

  const a = res.analysis;

  if (!started && res.profile.revision === 0)
    return (
      <Shell>
        <div className="py-4">
          <div className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-2">
            <Sparkles size={14} /> 2025 federal return
          </div>
          <h1 className="mt-4 text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">Let&apos;s get your taxes done, with as few questions as possible.</h1>
          <ul className="mt-6 space-y-3 text-[17px] text-ink-2">
            <li className="flex gap-3">
              <Num n={1} /> Answer 3 quick questions
            </li>
            <li className="flex gap-3">
              <Num n={2} /> Add your W-2. We read the numbers for you
            </li>
            <li className="flex gap-3">
              <Num n={3} /> We only ask what your documents can&apos;t tell us
            </li>
          </ul>
          <button onClick={() => setStarted(true)} className="mt-8 w-full min-h-14 rounded-2xl bg-ink text-lg font-semibold text-white hover:bg-ink-2">
            Start
          </button>
          <p className="mt-4 flex items-center justify-center gap-2 text-sm text-ink-3">
            <ShieldCheck size={16} /> About 3 minutes. Progress stays in this browser tab only.
          </p>
        </div>
      </Shell>
    );

  const editQ = editing ? a.questions.find((q) => q.id === editing) : null;
  const pIdx = phaseIndex[a.phase] ?? 0;
  const unconfirmed = a.docs.filter((d) => !d.confirmed);

  let body: React.ReactNode;
  if (busy) {
    body = (
      <div className="flex flex-col items-center gap-4 py-24 text-center" role="status">
        <Loader2 size={36} className="animate-spin text-brand" />
        <div className="text-lg font-semibold">{busy}</div>
      </div>
    );
  } else if (editQ) {
    body = (
      <QuestionCard
        key={editQ.id + "-edit"}
        q={editQ}
        current={res.profile.answers[editQ.id]?.value}
        onAnswer={(v) => send({ type: "answer", questionId: editQ.id, value: v })}
        onCancel={() => setEditing(null)}
      />
    );
  } else if (a.next) {
    body = (
      <>
        <QuestionCard
          key={a.next.id}
          q={a.next}
          current={res.profile.answers[a.next.id]?.value}
          onAnswer={(v) => send({ type: "answer", questionId: a.next!.id, value: v })}
          onSkip={() => send({ type: "skip", questionId: a.next!.id })}
        />
      </>
    );
  } else if (a.phase === "documents") {
    body = <DocumentsStep res={res} send={send} />;
  } else if (a.phase === "confirm") {
    const d = unconfirmed[0];
    const total = a.docs.length;
    body = (
      <>
        <ConfirmDoc
          key={d.id}
          doc={d}
          index={total - unconfirmed.length + 1}
          total={total}
          onConfirm={(fields) => send({ type: "confirmDocument", docId: d.id, fields })}
        />
        <Notices items={a.notices} />
      </>
    );
  } else if (a.phase === "unsupported") {
    body = <UnsupportedStep res={res} onChange={setEditing} onRestart={restart} />;
  } else if (a.phase === "verify") {
    body = <VerifyStep res={res} send={send} onChange={setEditing} />;
  } else if (a.phase === "estimate") {
    body = <EstimateStep res={res} send={send} />;
  } else {
    body = (
      <ApprovedStep
        res={res}
        onRestart={restart}
        onAskTutor={() => {
          useApp.getState().setTutorOpen(true);
          askTutorQuestion(a.calc && a.calc.refund >= 0 ? "Why am I getting a refund?" : "Why do I owe money?", "/taxes");
        }}
      />
    );
  }

  return (
    <Shell>
      <div className="mb-6">
        <div className="flex items-center justify-between text-xs font-semibold text-ink-3">
          <span>
            {PHASES[pIdx]} · step {pIdx + 1} of {PHASES.length}
          </span>
          <button onClick={restart} className="inline-flex items-center gap-1 hover:text-ink" aria-label="Start over">
            <RotateCcw size={12} /> Start over
          </button>
        </div>
        <SaveStatus state={saveState} configured={auth.configured} signedIn={signedIn} />
        <div className="mt-2 flex gap-1.5" aria-hidden>
          {PHASES.map((p, i) => (
            <div key={p} className={cn("h-1.5 flex-1 rounded-full transition-colors", i < pIdx ? "bg-brand" : i === pIdx ? "bg-ink" : "bg-line")} />
          ))}
        </div>
      </div>
      {body}
    </Shell>
  );
}

function SaveStatus({ state, configured, signedIn }: { state: string; configured: boolean; signedIn: boolean }) {
  const text =
    state === "saving" ? "Saving…" : state === "account" ? "Saved to your account" : state === "error" ? "Couldn't reach your account. Saved in this tab" : "Saved in this tab only";
  return (
    <div className="mt-2 flex items-center gap-2 text-xs text-ink-3" aria-live="polite">
      <Cloud size={12} className={state === "account" ? "text-brand" : state === "error" ? "text-warn" : ""} />
      <span>{text}</span>
      {configured && !signedIn && (
        <Link href="/account" className="font-semibold text-info hover:underline">
          Save across devices
        </Link>
      )}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-xl">{children}</div>;
}

function Num({ n }: { n: number }) {
  return <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-sm font-bold text-mint">{n}</span>;
}
