"use client";

import { domMax, LazyMotion } from "motion/react";

/**
 * Lazily loads the DOM feature bundle and enforces `strict` mode, so every
 * animated element must use the lightweight `m.*` components. We use domMax
 * (not domAnimation) because the task rows rely on the `layout` feature to
 * slide up as siblings complete and to re-settle on rollback — layout
 * projection ships only in domMax.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domMax} strict>
      {children}
    </LazyMotion>
  );
}
