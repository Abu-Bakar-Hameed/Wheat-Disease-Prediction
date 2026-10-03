"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * Material Symbols Outlined icon. Kept as a primitive so the whole app shares
 * one accessible icon surface (aria-hidden by default; add aria-label to make
 * it a standalone meaningful icon).
 */
export interface IconProps {
  name: string;
  className?: string;
  size?: number | string;
  filled?: boolean;
  weight?: number;
  grade?: number;
  style?: CSSProperties;
  "aria-label"?: string;
}

export function Icon({
  name,
  className,
  size = 20,
  filled = false,
  weight = 400,
  grade = 0,
  style,
  ...rest
}: IconProps) {
  const label = rest["aria-label"];
  return (
    <span
      className={cn("material-symbols-outlined select-none leading-none", className)}
      style={{
        fontSize: typeof size === "number" ? `${size}px` : size,
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' ${weight}, 'GRAD' ${grade}, 'opsz' 24`,
        ...style,
      }}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    >
      {name}
    </span>
  );
}
