"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface TooltipProps {
  label: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  className?: string;
}

export function Tooltip({ label, children, side = "top", className }: TooltipProps) {
  const [show, setShow] = useState(false);
  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      {show && (
        <span
          role="tooltip"
          className={cn(
            "pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs font-medium text-white shadow-md animate-fade-in",
            side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5"
          )}
        >
          {label}
        </span>
      )}
    </span>
  );
}
