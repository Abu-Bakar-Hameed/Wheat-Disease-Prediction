"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Reveal — a tiny scroll-in wrapper for the single-page landing.
 * Fades + lifts its children the first time they enter the viewport.
 * Falls back to visible when IntersectionObserver is unavailable, and
 * respects prefers-reduced-motion (no transition). Uses only opacity/transform,
 * so it never causes layout shift.
 */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        "transition-all duration-[650ms] ease-out motion-reduce:transition-none",
        shown ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
        className
      )}
    >
      {children}
    </div>
  );
}
