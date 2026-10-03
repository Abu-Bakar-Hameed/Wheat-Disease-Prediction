"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { IconButton } from "./Button";

function useDismiss(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
}

export type ModalSize = "sm" | "md" | "lg" | "xl";

const SIZES: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  className?: string;
  showClose?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  className,
  showClose = true,
}: ModalProps) {
  useDismiss(open, onClose);
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px] animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        className={cn(
          "relative w-full bg-surface rounded-xl shadow-lg border border-line animate-scale-in",
          "flex max-h-[90vh] flex-col",
          SIZES[size],
          className
        )}
      >
        {(title || showClose) && (
          <div className="flex items-start justify-between gap-4 px-5 sm:px-6 py-4 border-b border-line">
            <div className="min-w-0">
              {title && <h2 className="text-base font-semibold text-ink">{title}</h2>}
              {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
            </div>
            {showClose && <IconButton icon="close" label="Close dialog" size="sm" onClick={onClose} />}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 sm:px-6 py-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-3 px-5 sm:px-6 py-4 border-t border-line">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export type DrawerSide = "left" | "right" | "top" | "bottom";

const SIDE_CLASS: Record<DrawerSide, string> = {
  right: "right-0 top-0 h-full w-full max-w-md border-l",
  left: "left-0 top-0 h-full w-full max-w-md border-r",
  top: "left-0 top-0 w-full border-b",
  bottom: "left-0 bottom-0 w-full border-t",
};

const SLIDE_KEY: Record<DrawerSide, string> = {
  right: "slide-in-right",
  left: "slide-in-left",
  top: "slide-in-top",
  bottom: "slide-in-bottom",
};

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  side?: DrawerSide;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function Drawer({ open, onClose, side = "right", title, children, className }: DrawerProps) {
  useDismiss(open, onClose);
  useEffect(() => {
    if (!open) return;
    const style = document.createElement("style");
    style.textContent = `
      @keyframes slide-in-right{from{transform:translateX(100%)}to{transform:translateX(0)}}
      @keyframes slide-in-left{from{transform:translateX(-100%)}to{transform:translateX(0)}}
      @keyframes slide-in-top{from{transform:translateY(-100%)}to{transform:translateY(0)}}
      @keyframes slide-in-bottom{from{transform:translateY(100%)}to{transform:translateY(0)}}`;
    style.dataset.wgDrawer = "1";
    document.head.appendChild(style);
    return () => {
      const existing = document.head.querySelector('style[data-wg-drawer="1"]');
      if (existing) existing.remove();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "absolute bg-surface border-line shadow-lg flex flex-col max-h-full",
          SIDE_CLASS[side],
          className
        )}
        style={{ animation: `${SLIDE_KEY[side]} 0.28s var(--ease-out) both` }}
      >
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-line">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <IconButton icon="close" label="Close panel" size="sm" onClick={onClose} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}
