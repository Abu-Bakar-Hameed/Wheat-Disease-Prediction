"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BadgeTone =
  | "neutral"
  | "brand"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "wheat";
export type BadgeVariant = "soft" | "solid" | "outline";

const TONES: Record<BadgeTone, { soft: string; solid: string; outline: string }> = {
  neutral: {
    soft: "bg-surface-muted text-muted",
    solid: "bg-ink text-white",
    outline: "border border-line text-muted",
  },
  brand: {
    soft: "bg-brand-50 text-brand-700",
    solid: "bg-brand-700 text-white",
    outline: "border border-brand-300 text-brand-700",
  },
  success: {
    soft: "bg-success-soft text-green-800",
    solid: "bg-success text-white",
    outline: "border border-green-300 text-green-700",
  },
  warning: {
    soft: "bg-warning-soft text-amber-800",
    solid: "bg-warning text-white",
    outline: "border border-amber-300 text-amber-700",
  },
  danger: {
    soft: "bg-danger-soft text-red-800",
    solid: "bg-danger text-white",
    outline: "border border-red-300 text-red-700",
  },
  info: {
    soft: "bg-info-soft text-blue-800",
    solid: "bg-info text-white",
    outline: "border border-blue-300 text-blue-700",
  },
  wheat: {
    soft: "bg-wheat-100 text-wheat-700",
    solid: "bg-wheat-500 text-white",
    outline: "border border-wheat-300 text-wheat-700",
  },
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  variant?: BadgeVariant;
  dot?: boolean;
  children?: ReactNode;
}

export function Badge({
  tone = "neutral",
  variant = "soft",
  dot = false,
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium text-xs leading-none px-2.5 py-1",
        TONES[tone][variant],
        className
      )}
      {...rest}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />}
      {children}
    </span>
  );
}
