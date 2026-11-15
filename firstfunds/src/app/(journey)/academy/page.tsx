"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Award, BookOpen, Check, CheckCircle2, Clock, ExternalLink, GraduationCap, RotateCcw, Sparkles, X } from "lucide-react";
import { ALL_LESSONS, MODULES, PASS_RATIO, XP_PER_LESSON, type Lesson } from "@/lib/academy/lessons";
import { stats, useAcademyProgress } from "@/lib/academy/progress";
import { useApp } from "@/lib/store";
import { askTutorQuestion } from "@/lib/tutor/ask";
import { TryIt } from "@/components/academy/TryIt";
import { Card, cn } from "@/components/ui";

export default function AcademyPage() {
  const academy = useAcademyProgress();
  const [open, setOpen] = useState<string | null>(null);
  const lesson = open ? ALL_LESSONS.find((l) => l.id === open) ?? null : null;
  const s = stats(academy.progress);

  if (lesson)
    return (
      <LessonView
        key={lesson.id}
        lesson={lesson}
        done={!!academy.progress.completed[lesson.id]}
        onExit={() => {
          setOpen(null);
          window.scrollTo({ top: 0 });
        }}
        onComplete={(score, total) => academy.complete(lesson.id, score, total)}
        onNext={() => {
          const i = ALL_LESSONS.findIndex((l) => l.id === lesson.id);
          setOpen(ALL_LESSONS[i + 1]?.id ?? null);
          window.scrollTo({ top: 0 });
        }}
      />
    );

  return (
    <div>
      <div className="grid items-end gap-6 md:grid-cols-[1fr_340px]">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-2">
            <GraduationCap size={14} /> Financial Advisory Academy
          </div>
          <h1 className="mt-3 text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">Learn taxes before you file your first return</h1>
          <p className="mt-3 max-w-xl text-ink-2">
            Ten short lessons, about 28 minutes in all, with real 2025 IRS numbers, hands-on examples and quick quizzes. Finish them and
            the Tax Assistant will make a lot more sense.
          </p>
        </div>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold tracking-wide text-ink-3 uppercase">Your progress</div>
              <div className="num mt-1 text-2xl font-semibold">
                {s.done}/{s.total} lessons
              </div>
            </div>
            <div className="text-right">
              <div className="num text-2xl font-semibold text-brand">{s.xp} XP</div>
              <div className="text-xs text-ink-3">{XP_PER_LESSON} per lesson</div>
            </div>
          </div>
          <div className="mt-3 h-2 rounded-full bg-line">
            <div className="h-2 rounded-full bg-brand transition-all duration-500" style={{ width: `${(s.done / s.total) * 100}%` }} />
          </div>
          {s.next ? (
            <button onClick={() => setOpen(s.next!.id)} className="mt-4 flex w-full min-h-12 items-center justify-center gap-2 rounded-xl bg-ink font-semibold text-paper">
              {s.done ? "Continue" : "Start"}: {s.next.title} <ArrowRight size={16} />
            </button>
          ) : (
            <Link href="/taxes" className="mt-4 flex w-full min-h-12 items-center justify-center gap-2 rounded-xl bg-brand font-semibold text-on-brand">
              Course complete. Start your return <ArrowRight size={16} />
            </Link>
          )}
          <p className="mt-2 text-center text-[11px] text-ink-3">
            {academy.signedIn ? (academy.synced === "error" ? "Couldn't sync. Saved on this device" : "Synced to your account") : "Saved on this device"}
            {academy.configured && !academy.signedIn && (
              <>
                {" · "}
                <Link href="/account" className="font-semibold text-info">
                  Sign in to sync
                </Link>
              </>
            )}
          </p>
        </Card>
      </div>

      {s.badges.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2" aria-label="Badges earned">
          {s.badges.map((b) => (
            <span key={b} className="inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-3 py-1.5 text-sm font-semibold text-warn">
              <Award size={15} /> {b}
            </span>
          ))}
        </div>
      )}

      <div className="mt-8 space-y-8">
        {MODULES.map((m, mi) => {
          const doneCount = m.lessons.filter((l) => academy.progress.completed[l.id]).length;
          return (
            <section key={m.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold">
                  <span className="text-ink-3">Module {mi + 1} · </span>
                  {m.title}
                </h2>
                <span className="text-sm text-ink-3">
                  {doneCount}/{m.lessons.length} · badge: {m.badge}
                </span>
              </div>
              <p className="text-sm text-ink-3">{m.blurb}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {m.lessons.map((l) => {
                  const done = academy.progress.completed[l.id];
                  return (
                    <button
                      key={l.id}
                      onClick={() => setOpen(l.id)}
                      className={cn("rounded-2xl border bg-card p-4 text-left transition-colors hover:border-brand", done ? "border-brand/40" : "border-line")}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold">{l.title}</div>
                        {done ? <CheckCircle2 size={20} className="shrink-0 text-brand" /> : <BookOpen size={18} className="shrink-0 text-ink-3" />}
                      </div>
                      <p className="mt-1 text-sm text-ink-2">{l.summary}</p>
                      <div className="mt-3 flex items-center gap-3 text-xs text-ink-3">
                        <span className="inline-flex items-center gap-1">
                          <Clock size={12} /> {l.minutes} min
                        </span>
                        {l.tryIt && <span>Interactive</span>}
                        {done && (
                          <span className="font-semibold text-brand">
                            Quiz {done.score}/{done.total}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {s.done > 0 && (
        <button onClick={academy.reset} className="mt-10 inline-flex items-center gap-1 text-xs text-ink-3 hover:text-ink">
          <RotateCcw size={12} /> Reset my progress
        </button>
      )}
    </div>
  );
}

type Stage = { kind: "card"; i: number } | { kind: "try" } | { kind: "quiz"; i: number } | { kind: "done" };

function LessonView({
  lesson,
  done,
  onExit,
  onComplete,
  onNext,
}: {
  lesson: (typeof ALL_LESSONS)[number];
  done: boolean;
  onExit: () => void;
  onComplete: (score: number, total: number) => void;
  onNext: () => void;
}) {
  const [stage, setStage] = useState<Stage>({ kind: "card", i: 0 });
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const steps = lesson.cards.length + (lesson.tryIt ? 1 : 0) + lesson.quiz.length;
  const pos =
    stage.kind === "card" ? stage.i : stage.kind === "try" ? lesson.cards.length : stage.kind === "quiz" ? lesson.cards.length + (lesson.tryIt ? 1 : 0) + stage.i : steps;
  const passed = score / lesson.quiz.length >= PASS_RATIO;
  const isLast = ALL_LESSONS[ALL_LESSONS.length - 1].id === lesson.id;

  const afterCards = (): Stage => (lesson.tryIt ? { kind: "try" } : { kind: "quiz", i: 0 });

  function nextFromCard(i: number) {
    setStage(i + 1 < lesson.cards.length ? { kind: "card", i: i + 1 } : afterCards());
  }
  function answer(i: number, opt: number) {
    if (picked !== null) return;
    setPicked(opt);
    if (opt === lesson.quiz[i].correct) setScore((s) => s + 1);
  }
  function nextQuestion(i: number) {
    setPicked(null);
    if (i + 1 < lesson.quiz.length) setStage({ kind: "quiz", i: i + 1 });
    else {
      setStage({ kind: "done" });
      if ((score / lesson.quiz.length) >= PASS_RATIO) onComplete(score, lesson.quiz.length);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="flex items-center justify-between text-sm">
        <button onClick={onExit} className="inline-flex items-center gap-1 font-medium text-ink-2 hover:text-ink">
          <ArrowLeft size={16} /> All lessons
        </button>
        <span className="text-xs text-ink-3">
          {lesson.moduleTitle}
          {done && " · completed"}
        </span>
      </div>
      <div className="mt-3 flex gap-1" aria-hidden>
        {Array.from({ length: steps }, (_, i) => (
          <div key={i} className={cn("h-1.5 flex-1 rounded-full", i < pos ? "bg-brand" : i === pos ? "bg-ink" : "bg-line")} />
        ))}
      </div>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">{lesson.title}</h1>

      <div className="mt-5">
        {stage.kind === "card" && (
          <div>
            <Card>
              <div className="text-xs font-semibold tracking-widest text-ink-3 uppercase">
                {stage.i + 1} of {lesson.cards.length}
              </div>
              <h2 className="mt-2 text-xl font-semibold">{lesson.cards[stage.i].heading}</h2>
              <p className="mt-2 text-[17px] leading-relaxed text-ink-2">{lesson.cards[stage.i].body}</p>
            </Card>
            <div className="mt-4 flex gap-2">
              {stage.i > 0 && (
                <button onClick={() => setStage({ kind: "card", i: stage.i - 1 })} className="min-h-14 rounded-2xl border-2 border-line bg-card px-5 font-semibold">
                  Back
                </button>
              )}
              <button onClick={() => nextFromCard(stage.i)} className="min-h-14 flex-1 rounded-2xl bg-ink font-semibold text-paper">
                Next
              </button>
            </div>
          </div>
        )}

        {stage.kind === "try" && lesson.tryIt && (
          <div>
            <TryIt kind={lesson.tryIt} />
            <button onClick={() => setStage({ kind: "quiz", i: 0 })} className="mt-4 w-full min-h-14 rounded-2xl bg-ink font-semibold text-paper">
              Quick quiz ({lesson.quiz.length} questions)
            </button>
          </div>
        )}

        {stage.kind === "quiz" && (
          <QuizStep
            q={lesson.quiz[stage.i]}
            index={stage.i}
            total={lesson.quiz.length}
            picked={picked}
            onPick={(o) => answer(stage.i, o)}
            onNext={() => nextQuestion(stage.i)}
          />
        )}

        {stage.kind === "done" && (
          <div className="text-center">
            {passed ? <CheckCircle2 size={56} className="mx-auto text-brand" /> : <Sparkles size={48} className="mx-auto text-warn" />}
            <h2 className="mt-3 text-2xl font-semibold">{passed ? "Lesson complete" : "Almost there"}</h2>
            <p className="mt-1 text-ink-2">
              You got {score} of {lesson.quiz.length} right.{" "}
              {passed ? `+${XP_PER_LESSON} XP` : `Get ${Math.ceil(lesson.quiz.length * PASS_RATIO)} right to complete the lesson.`}
            </p>
            <div className="mt-6 space-y-3">
              {passed ? (
                isLast ? (
                  <Link href="/taxes" className="flex w-full min-h-14 items-center justify-center gap-2 rounded-2xl bg-brand font-semibold text-on-brand">
                    Use it: start your return <ArrowRight size={18} />
                  </Link>
                ) : (
                  <button onClick={onNext} className="w-full min-h-14 rounded-2xl bg-ink font-semibold text-paper">
                    Next lesson
                  </button>
                )
              ) : (
                <button
                  onClick={() => {
                    setScore(0);
                    setPicked(null);
                    setStage({ kind: "card", i: 0 });
                  }}
                  className="w-full min-h-14 rounded-2xl bg-ink font-semibold text-paper"
                >
                  Review and try again
                </button>
              )}
              <button
                onClick={() => {
                  useApp.getState().setTutorOpen(true);
                  askTutorQuestion(`Can you explain more about: ${lesson.title}?`, "/academy");
                }}
                className="flex w-full min-h-14 items-center justify-center gap-2 rounded-2xl border-2 border-line bg-card font-semibold"
              >
                <Sparkles size={18} className="text-brand" /> Ask FinPilot about this
              </button>
            </div>
            <div className="mt-6 text-left">
              <div className="text-xs font-semibold tracking-wide text-ink-3 uppercase">Sources</div>
              <ul className="mt-1 space-y-1">
                {lesson.sources.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-info hover:underline">
                      {s.label} <ExternalLink size={12} />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function QuizStep({
  q,
  index,
  total,
  picked,
  onPick,
  onNext,
}: {
  q: Lesson["quiz"][number];
  index: number;
  total: number;
  picked: number | null;
  onPick: (o: number) => void;
  onNext: () => void;
}) {
  return (
    <div>
      <div className="text-xs font-semibold tracking-widest text-ink-3 uppercase">
        Question {index + 1} of {total}
      </div>
      <h2 className="mt-2 text-xl leading-snug font-semibold">{q.q}</h2>
      <div className="mt-4 space-y-2.5">
        {q.options.map((o, i) => {
          const state = picked === null ? "idle" : i === q.correct ? "right" : i === picked ? "wrong" : "dim";
          return (
            <button
              key={o}
              onClick={() => onPick(i)}
              disabled={picked !== null}
              className={cn(
                "flex w-full min-h-14 items-center justify-between gap-3 rounded-2xl border-2 px-4 py-3 text-left font-semibold transition-colors",
                state === "idle" && "border-line bg-card hover:border-ink-3",
                state === "right" && "border-brand bg-brand-soft text-brand-2",
                state === "wrong" && "border-debt bg-debt-soft text-debt",
                state === "dim" && "border-line bg-card opacity-50",
              )}
            >
              {o}
              {state === "right" && <Check size={18} />}
              {state === "wrong" && <X size={18} />}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <div className="mt-4" aria-live="polite">
          <p className={cn("rounded-xl p-3 text-sm", picked === q.correct ? "bg-brand-soft" : "bg-warn-soft")}>
            <b>{picked === q.correct ? "Correct. " : "Not quite. "}</b>
            {q.explain}
          </p>
          <button onClick={onNext} className="mt-3 w-full min-h-14 rounded-2xl bg-ink font-semibold text-paper">
            {index + 1 < total ? "Next question" : "See results"}
          </button>
        </div>
      )}
    </div>
  );
}
