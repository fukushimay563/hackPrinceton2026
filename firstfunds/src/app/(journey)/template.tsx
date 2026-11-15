"use client";
// Route transition for every journey page (fade + slide, 320ms, from lib/motion).
import type { ReactNode } from "react";
import { PageTransition } from "@/components/motion";

export default function Template({ children }: { children: ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
