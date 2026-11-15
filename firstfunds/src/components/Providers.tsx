"use client";
// App-wide motion settings: every Motion animation honors the OS "reduce motion" setting.
import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}>
      {children}
    </MotionConfig>
  );
}
