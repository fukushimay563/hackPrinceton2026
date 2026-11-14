"use client";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useApp } from "@/lib/store";
import { TutorChat } from "./TutorChat";

/** Slide-over tutor available on every journey page. */
export function TutorPanel() {
  const { tutorOpen, setTutorOpen } = useApp();
  const path = usePathname();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!tutorOpen) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setTutorOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tutorOpen, setTutorOpen]);

  if (!tutorOpen || path.startsWith("/finpilot")) return null;
  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="FinPilot AI assistant">
      <button aria-label="Close tutor" className="absolute inset-0 bg-ink/30" onClick={() => setTutorOpen(false)} />
      <div className="absolute top-0 right-0 flex h-full w-full max-w-md flex-col bg-paper shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <div className="font-semibold">FinPilot</div>
            <div className="text-xs text-ink-3">Money, tax and app help, with your numbers</div>
          </div>
          <button ref={closeRef} onClick={() => setTutorOpen(false)} aria-label="Close" className="rounded-lg p-2 hover:bg-black/5">
            <X size={18} />
          </button>
        </div>
        <TutorChat compact />
      </div>
    </div>
  );
}
