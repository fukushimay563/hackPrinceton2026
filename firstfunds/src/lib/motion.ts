// FirstFunds motion system: one place for timings, easings, springs and variants.
// Components import from here instead of hand-tuning values. Everything animates
// transform/opacity only; MotionConfig(reducedMotion="user") strips movement for
// people who ask for reduced motion, and helpers below make that explicit.
import type { Transition, Variants } from "framer-motion";

export const DURATION = {
  press: 0.12, // buttons: 100–180ms
  hover: 0.18,
  card: 0.22, // cards: 180–250ms
  page: 0.32, // pages: 250–400ms
  sequence: 0.55, // complex: 400–700ms
} as const;

export const EASE = {
  out: [0.22, 1, 0.36, 1] as [number, number, number, number], // natural deceleration
  inOut: [0.65, 0, 0.35, 1] as [number, number, number, number],
};

export const SPRING = {
  snappy: { type: "spring", stiffness: 520, damping: 34, mass: 0.7 } as Transition, // presses, indicators
  soft: { type: "spring", stiffness: 260, damping: 30 } as Transition, // cards, layout
  gentle: { type: "spring", stiffness: 140, damping: 22 } as Transition, // numbers, large panels
};

export const STAGGER = { tight: 0.04, base: 0.06, loose: 0.1 } as const;

export const pageVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  enter: { opacity: 1, y: 0, transition: { duration: DURATION.page, ease: EASE.out } },
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: DURATION.card, ease: EASE.out } },
};

export const staggerParent = (stagger: number = STAGGER.base, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger, delayChildren: delay } },
});

export const cardHover = { y: -2, transition: { duration: DURATION.hover, ease: EASE.out } };
export const pressDown = { scale: 0.97, transition: { duration: DURATION.press } };

export const modalVariants: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: SPRING.soft },
  exit: { opacity: 0, y: 8, scale: 0.98, transition: { duration: DURATION.hover } },
};

export const drawerVariants: Variants = {
  hidden: { x: "100%" },
  show: { x: 0, transition: { duration: DURATION.page, ease: EASE.out } },
  exit: { x: "100%", transition: { duration: DURATION.card, ease: EASE.inOut } },
};

export const messageVariants: Variants = {
  hidden: { opacity: 0, y: 10, scale: 0.985 },
  show: { opacity: 1, y: 0, scale: 1, transition: SPRING.soft },
};
