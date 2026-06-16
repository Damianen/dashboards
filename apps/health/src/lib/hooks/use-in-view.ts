"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Returns a ref to attach and whether the element has entered the viewport.
 * The flag latches `true` on first intersection (and disconnects), so it drives
 * lazy, one-shot data loads — a card fetches when first scrolled into view and
 * never reverts to idle. Falls back to visible when IntersectionObserver is
 * unavailable (e.g. SSR / older runtimes).
 */
export function useInView<T extends Element = HTMLDivElement>(
  rootMargin = "200px",
): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (inView) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView, rootMargin]);

  return [ref, inView];
}
