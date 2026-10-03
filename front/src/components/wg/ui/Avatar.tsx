"use client";

import { cn } from "@/lib/utils";

export type AvatarSize = "sm" | "md" | "lg" | "xl";

const SIZES: Record<AvatarSize, string> = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-16 w-16 text-xl",
};

export interface AvatarProps {
  src?: string | null;
  name?: string | null;
  size?: AvatarSize;
  className?: string;
  /** Optional status dot color class, e.g. "bg-success". */
  status?: string;
}

function initials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({ src, name, size = "md", className, status }: AvatarProps) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <span
        className={cn(
          "inline-flex items-center justify-center overflow-hidden rounded-full bg-brand-100 font-semibold text-brand-800 ring-1 ring-line select-none",
          SIZES[size]
        )}
        aria-hidden={!name}
        title={name ?? undefined}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={name ? `${name} avatar` : "avatar"} className="h-full w-full object-cover" />
        ) : (
          initials(name)
        )}
      </span>
      {status && (
        <span
          className={cn(
            "absolute bottom-0 right-0 h-3 w-3 rounded-full ring-2 ring-surface",
            status
          )}
        />
      )}
    </span>
  );
}
