"use client";
// Reusable motion primitives built on the shared system in lib/motion.ts.
import { animate, AnimatePresence, motion, useInView, useMotionValue, useReducedMotion, useTransform, type HTMLMotionProps } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { DURATION, EASE, cardHover, fadeUp, modalVariants, pageVariants, pressDown, staggerParent, STAGGER } from "@/lib/motion";
import { cn } from "./ui";

/** Route-level transition: fade + 10px rise. Reduced motion: content appears at once. */
export function PageTransition({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div variants={pageVariants} initial={reduce ? false : "initial"} animate="enter">
      {children}
    </motion.div>
  );
}

/** Reveals children once when scrolled into view. Never hides content for reduced motion. */
export function AnimatedSection({ children, className, delay = 0, as = "section" }: { children: ReactNode; className?: string; delay?: number; as?: "section" | "div" }) {
  const reduce = useReducedMotion();
  const Comp = as === "section" ? motion.section : motion.div;
  return (
    <Comp
      className={className}
      initial={reduce ? false : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={{ duration: DURATION.sequence, ease: EASE.out, delay }}
    >
      {children}
    </Comp>
  );
}

/** Staggers direct StaggerItem children in on mount (or when in view). */
export function StaggerContainer({ children, className, stagger = STAGGER.base, delay = 0, inView = false }: { children: ReactNode; className?: string; stagger?: number; delay?: number; inView?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={staggerParent(stagger, delay)}
      initial={reduce ? false : "hidden"}
      {...(inView ? { whileInView: "show", viewport: { once: true, margin: "0px 0px -10% 0px" } } : { animate: "show" })}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={fadeUp}>
      {children}
    </motion.div>
  );
}

/** Card with a gentle lift, press feedback, and a soft highlight that follows the pointer. */
export function MotionCard({ children, className, onClick, highlight = true, ...rest }: HTMLMotionProps<"div"> & { highlight?: boolean; children: ReactNode }) {
  const mx = useMotionValue(-200);
  const my = useMotionValue(-200);
  const bg = useTransform([mx, my], ([x, y]) => `radial-gradient(220px circle at ${x}px ${y}px, color-mix(in srgb, var(--color-ink) 5%, transparent), transparent 70%)`);
  return (
    <motion.div
      {...rest}
      onClick={onClick}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        mx.set(e.clientX - r.left);
        my.set(e.clientY - r.top);
      }}
      onPointerLeave={() => {
        mx.set(-200);
        my.set(-200);
      }}
      whileHover={cardHover}
      whileTap={onClick ? pressDown : undefined}
      className={cn("relative overflow-hidden rounded-2xl border border-line bg-card transition-colors duration-200 hover:border-ink-3", className)}
    >
      {highlight && <motion.span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: bg }} />}
      <div className="relative">{children}</div>
    </motion.div>
  );
}

/**
 * Counts to `value` when it first becomes visible or changes. The final value is always in
 * the accessible name and shown immediately for reduced motion, so nothing is delayed or distorted.
 */
export function AnimatedNumber({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [shown, setShown] = useState(reduce ? value : 0);
  const from = useRef(0);
  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      const t = setTimeout(() => setShown(value), 0);
      return () => clearTimeout(t);
    }
    const controls = animate(from.current, value, {
      duration: DURATION.sequence,
      ease: EASE.out,
      onUpdate: (v) => setShown(v),
      onComplete: () => (from.current = value),
    });
    return () => controls.stop();
  }, [value, inView, reduce]);
  return (
    <span ref={ref} className={cn("num", className)} aria-label={format(value)}>
      <span aria-hidden>{format(shown)}</span>
    </span>
  );
}

/** Centered modal with backdrop. Escape and backdrop click close it; focus returns afterwards. */
export function AnimatedModal({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={label}>
          <motion.button aria-label="Close" className="absolute inset-0 bg-ink/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div variants={modalVariants} initial="hidden" animate="show" exit="exit" className="relative w-full max-w-lg rounded-2xl border border-line bg-card p-6">
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
