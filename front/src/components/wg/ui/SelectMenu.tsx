"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./Icon";

export interface SelectOption {
  value: string;
  label: ReactNode;
  /** Optional string used for the trigger's displayed text; falls back to `label` when it is a string. */
  text?: string;
  disabled?: boolean;
}

export interface SelectMenuProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Accessible name for the control. */
  ariaLabel?: string;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  /** Classes for the outer wrapper (used to size the trigger, e.g. "w-full sm:w-48"). */
  className?: string;
  /** Classes applied to the trigger button. */
  buttonClassName?: string;
  /** Optional leading material icon shown on the trigger. */
  icon?: string;
}

interface Coords {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  openUp: boolean;
}

/**
 * A mobile-responsive, accessible replacement for the browser's native
 * `<select>`. The list is rendered in a portal with fixed positioning that is
 * measured against the trigger, so it never gets clipped by an ancestor with
 * `overflow-hidden` (e.g. the dashboard `Card`s) and never overflows the
 * viewport on small screens. It flips upward and scrolls when space is tight.
 */
export function SelectMenu({
  value,
  onChange,
  options,
  ariaLabel,
  placeholder = "Select…",
  id,
  disabled,
  className,
  buttonClassName,
  icon,
}: SelectMenuProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);
  const selectedText =
    (selected?.text ?? (typeof selected?.label === "string" ? selected.label : undefined)) ||
    placeholder;

  const measure = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;

    const spaceBelow = vh - rect.bottom;
    const spaceAbove = rect.top;
    const openUp = spaceBelow < 240 && spaceAbove > spaceBelow;

    // Match the trigger width but keep the list readable and on-screen.
    let width = Math.max(rect.width, 180);
    width = Math.min(width, vw - margin * 2);

    let left = rect.left;
    if (left + width > vw - margin) left = vw - margin - width;
    if (left < margin) left = margin;

    const available = (openUp ? spaceAbove : spaceBelow) - margin * 2;
    const maxHeight = Math.max(160, Math.min(320, available));

    setCoords({
      top: openUp ? rect.top - 6 : rect.bottom + 6,
      left,
      width,
      maxHeight,
      openUp,
    });
  }, []);

  useLayoutEffect(() => {
    // The list only renders while `open && coords`, so stale coords from a
    // previous open are never shown; re-measuring on open is enough.
    if (!open) return;
    measure();
    const onReflow = () => measure();
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open, measure]);

  // Close on outside pointer-down or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (opt: SelectOption) => {
    if (opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const list =
    open && coords && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={listRef}
            role="listbox"
            aria-label={ariaLabel}
            tabIndex={-1}
            style={{
              position: "fixed",
              left: coords.left,
              width: coords.width,
              maxHeight: coords.maxHeight,
              ...(coords.openUp
                ? { bottom: window.innerHeight - coords.top }
                : { top: coords.top }),
            }}
            className="z-[80] overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface p-1 shadow-xl animate-scale-in"
          >
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={opt.disabled}
                  onClick={() => choose(opt)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors duration-150",
                    "hover:bg-surface-muted disabled:opacity-50 disabled:pointer-events-none",
                    isSelected
                      ? "bg-brand-50 font-semibold text-brand-800 dark:bg-brand-900/40 dark:text-brand-200"
                      : "text-ink"
                  )}
                >
                  <span className="min-w-0 truncate">{opt.label}</span>
                  {isSelected && (
                    <Icon name="check" size={18} className="shrink-0 text-brand-700 dark:text-brand-300" />
                  )}
                </button>
              );
            })}
          </div>,
          document.body
        )
      : null;

  return (
    <div className={cn("relative", className)}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 text-sm text-ink",
          "transition-[border-color,box-shadow] duration-200 hover:border-brand-300",
          "focus:outline-none focus-visible:border-brand-500 focus-visible:ring-4 focus-visible:ring-brand-600/20",
          "disabled:cursor-not-allowed disabled:opacity-60",
          open && "border-brand-500 ring-4 ring-brand-600/20",
          buttonClassName
        )}
      >
        <span className={cn("min-w-0 flex-1 truncate", !selected && "text-muted")}>
          {icon && (
            <Icon name={icon} size={18} className="mr-1.5 inline-block align-[-3px] text-muted" />
          )}
          {selectedText}
        </span>
        <Icon
          name="expand_more"
          size={20}
          className={cn("shrink-0 text-muted transition-transform duration-200", open && "rotate-180")}
        />
      </button>
      {list}
    </div>
  );
}
