"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./Icon";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  | "subtle";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-700 text-white shadow-sm hover:bg-brand-800 active:bg-brand-900 focus-visible:ring-brand-600/40",
  secondary:
    "bg-brand-100 text-brand-800 hover:bg-brand-200 active:bg-brand-300 focus-visible:ring-brand-600/30",
  outline:
    "border border-line bg-surface text-ink hover:bg-surface-muted hover:border-brand-300 active:bg-brand-50 focus-visible:ring-brand-600/25",
  ghost:
    "text-ink hover:bg-surface-muted active:bg-line/60 focus-visible:ring-brand-600/25",
  danger:
    "bg-danger text-white shadow-sm hover:bg-red-700 active:bg-red-800 focus-visible:ring-danger/40",
  subtle:
    "bg-surface-muted text-ink hover:bg-line/70 active:bg-line focus-visible:ring-brand-600/20",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-9 min-h-9 px-3 text-sm gap-1.5 rounded-md",
  md: "h-11 px-4 text-sm gap-2 rounded-lg",
  lg: "h-12 px-6 text-base gap-2 rounded-lg",
};

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn("animate-spin", className)}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: string;
  rightIcon?: string;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    fullWidth = false,
    leftIcon,
    rightIcon,
    className,
    children,
    disabled,
    type = "button",
    ...rest
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center font-medium whitespace-nowrap select-none",
        "transition-[background-color,color,box-shadow,border-color,transform] duration-200 ease-out",
        "focus-visible:outline-none focus-visible:ring-4 active:scale-[0.985]",
        "disabled:opacity-55 disabled:pointer-events-none disabled:active:scale-100",
        VARIANTS[variant],
        SIZES[size],
        fullWidth && "w-full",
        className
      )}
      {...rest}
    >
      {loading ? (
        <Spinner className="shrink-0" />
      ) : (
        leftIcon && <Icon name={leftIcon} size={size === "sm" ? 18 : 20} className="shrink-0" />
      )}
      {children}
      {!loading && rightIcon && (
        <Icon name={rightIcon} size={size === "sm" ? 18 : 20} className="shrink-0" />
      )}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: string;
  /** Accessible name is required for icon-only buttons. */
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconSize?: number;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { icon, label, variant = "ghost", size = "md", iconSize, className, type = "button", ...rest },
    ref
  ) {
    const box =
      size === "sm" ? "h-9 w-9 rounded-md" : size === "lg" ? "h-12 w-12 rounded-lg" : "h-11 w-11 rounded-lg";
    return (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        title={label}
        className={cn(
          "inline-flex items-center justify-center shrink-0",
          "transition-[background-color,color,box-shadow,transform] duration-200 ease-out",
          "focus-visible:outline-none focus-visible:ring-4 active:scale-[0.96]",
          "disabled:opacity-55 disabled:pointer-events-none",
          VARIANTS[variant],
          box,
          className
        )}
        {...rest}
      >
        <Icon name={icon} size={iconSize ?? (size === "sm" ? 18 : 20)} />
      </button>
    );
  }
);
