"use client";
// Academy progress: kept in localStorage (not sensitive: lesson ids and quiz scores)
// and, when signed in to Supabase, synced to the academy_progress table.
import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "../supabase/client";
import { useSession } from "../supabase/useSession";
import { ALL_LESSONS, MODULES, XP_PER_LESSON } from "./lessons";

export type Progress = { completed: Record<string, { score: number; total: number; at: number }> };

const KEY = "firstfunds.academy.v1";
const empty = (): Progress => ({ completed: {} });

function readLocal(): Progress {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return p && typeof p.completed === "object" ? p : empty();
  } catch {
    return empty();
  }
}
function writeLocal(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable */
  }
}

/** Union of two progress records, keeping the best score per lesson. */
export function mergeProgress(a: Progress, b: Progress): Progress {
  const out: Progress = { completed: { ...a.completed } };
  for (const [id, v] of Object.entries(b.completed)) {
    const cur = out.completed[id];
    if (!cur || v.score > cur.score) out.completed[id] = v;
  }
  return out;
}

export function stats(p: Progress) {
  const done = ALL_LESSONS.filter((l) => p.completed[l.id]).length;
  const badges = MODULES.filter((m) => m.lessons.every((l) => p.completed[l.id])).map((m) => m.badge);
  const next = ALL_LESSONS.find((l) => !p.completed[l.id]) ?? null;
  return { done, total: ALL_LESSONS.length, xp: done * XP_PER_LESSON, badges, next, finished: done === ALL_LESSONS.length };
}

export function useAcademyProgress() {
  const auth = useSession();
  const [progress, setProgress] = useState<Progress>(empty);
  const [synced, setSynced] = useState<"local" | "account" | "error">("local");
  const uid = auth.session?.user.id ?? null;

  // Load local, then merge in the account copy if signed in.
  useEffect(() => {
    const local = readLocal();
    // Deferred so the first client render matches the server render (no saved progress).
    Promise.resolve().then(() => setProgress(local));
    const sb = getSupabase();
    if (!sb || !uid) return;
    sb.from("academy_progress")
      .select("progress")
      .eq("user_id", uid)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) return setSynced("error");
        const merged = mergeProgress(local, (data?.progress as Progress) ?? empty());
        setProgress(merged);
        writeLocal(merged);
        setSynced("account");
      });
  }, [uid]);

  const complete = useCallback(
    (lessonId: string, score: number, total: number) => {
      setProgress((prev) => {
        const next = mergeProgress(prev, { completed: { [lessonId]: { score, total, at: Date.now() } } });
        writeLocal(next);
        const sb = getSupabase();
        if (sb && uid) {
          sb.from("academy_progress")
            .upsert({ user_id: uid, progress: next }, { onConflict: "user_id" })
            .then(({ error }) => setSynced(error ? "error" : "account"));
        }
        return next;
      });
    },
    [uid],
  );

  const reset = useCallback(() => {
    writeLocal(empty());
    setProgress(empty());
    const sb = getSupabase();
    if (sb && uid) sb.from("academy_progress").delete().eq("user_id", uid).then(() => {});
  }, [uid]);

  return { progress, complete, reset, synced, signedIn: !!uid, configured: auth.configured };
}
