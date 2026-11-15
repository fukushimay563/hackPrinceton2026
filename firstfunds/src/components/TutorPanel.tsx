"use client";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useApp } from "@/lib/store";
import { TutorChat } from "./TutorChat";

/** Slide-over advisor available on every journey page. Escape or the backdrop closes it. */
export function TutorPanel() {
  const { tutorOpen, setTutorOpen } = useApp();
  const path = usePathname();
  const closeRef = useRef<HTMLButtonElement>(null);
  const open = tutorOpen && !path.startsWith("/finpilot");

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTutorOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus?.();
    };
  }, [open, setTutorOpen]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="FinPilot AI advisor">
          <motion.button
            aria-label="Close FinPilot"
            className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setTutorOpen(false)}
          />
          <motion.div
            className="absolute top-0 right-0 flex h-full w-full max-w-md flex-col border-l border-line bg-paper shadow-2xl"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.26, ease: [0.2, 0.7, 0.2, 1] }}
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <div className="font-semibold">FinPilot</div>
                <div className="text-xs text-ink-3">Your AI financial advisor, using your numbers</div>
              </div>
              <button ref={closeRef} onClick={() => setTutorOpen(false)} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-lg hover:bg-ink/5">
                <X size={18} />
              </button>
            </div>
            <TutorChat compact />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
