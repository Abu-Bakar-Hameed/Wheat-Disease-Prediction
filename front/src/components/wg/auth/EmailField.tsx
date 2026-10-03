"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Labelled email input with a Material icon, an inline error slot and a green
 * check that appears once the value is a well-formed address. Touched-tracking
 * keeps the check from flashing while the user is mid-keystroke on a fresh field.
 */
export function EmailField({
  label = "Email address",
  value,
  onChange,
  placeholder = "name@farm.com",
  error,
  required = true,
  id = "email",
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  required?: boolean;
  id?: string;
}) {
  const [touched, setTouched] = useState(false);
  const valid = EMAIL_RE.test(value.trim());
  const showError = Boolean(error) || (touched && required && !value.trim());
  const inputId = `wg-email-${id}`;

  return (
    <div>
      <label
        htmlFor={inputId}
        className="mb-1 block text-[12px] font-semibold text-ink"
      >
        {label}
      </label>

      <div className="relative">
        <span
          className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          style={{ fontSize: 18 }}
          aria-hidden
        >
          mail
        </span>

        <input
          id={inputId}
          type="email"
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder={placeholder}
          aria-invalid={showError || undefined}
          aria-describedby={showError ? `${inputId}-error` : undefined}
          className={cn(
            "h-10 w-full rounded-lg border bg-surface pl-10 pr-10 text-[13px] text-ink outline-none transition-all placeholder:text-muted/70",
            showError ? "border-danger" : "border-line"
          )}
        />

        {valid && !showError && (
          <span
            className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-brand-600"
            style={{ fontSize: 18 }}
            aria-hidden
          >
            check_circle
          </span>
        )}
      </div>

      {showError && (
        <p
          id={`${inputId}-error`}
          className="mt-1 text-[11px] font-medium text-danger"
        >
          {error ?? "Enter a valid email address."}
        </p>
      )}
    </div>
  );
}
