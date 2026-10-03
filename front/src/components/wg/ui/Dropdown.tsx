"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface DropdownProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
  menuClassName?: string;
}

/** Lightweight click-outside dropdown. Consumers pass menu items as children. */
export function Dropdown({ trigger, children, align = "end", className, menuClassName }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div onClick={() => setOpen((v) => !v)}>{trigger}</div>
      {open && (
        <div
          role="menu"
          className={cn(
            "absolute z-40 mt-2 min-w-[12rem] overflow-hidden rounded-lg border border-line bg-surface p-1 shadow-lg animate-scale-in",
            align === "end" ? "right-0" : "left-0",
            menuClassName
          )}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export interface MenuItemProps {
  children: ReactNode;
  icon?: string;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  className?: string;
}

export function MenuItem({ children, icon, onClick, danger, disabled, className }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-left transition-colors duration-150",
        "hover:bg-surface-muted disabled:opacity-50 disabled:pointer-events-none",
        danger ? "text-danger hover:bg-danger-soft" : "text-ink",
        className
      )}
    >
      {icon && <span className="material-symbols-outlined text-[18px]" aria-hidden>{icon}</span>}
      {children}
    </button>
  );
}

export function MenuDivider({ className }: { className?: string }) {
  return <div className={cn("my-1 h-px bg-line", className)} />;
}
