"use client";

import {
  useRef,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { cn } from "@/lib/utils";

/**
 * Accessible 6-digit one-time-code input: one box per digit, auto-advance on
 * entry, backspace steps back, and pasting a full code distributes it across
 * the boxes. Controlled via `value` (a digit string) + `onChange`.
 */
export function OtpInput({
  value,
  onChange,
  length = 6,
  disabled = false,
  onComplete,
  ariaLabel = "Verification code",
}: {
  value: string;
  onChange: (next: string) => void;
  length?: number;
  disabled?: boolean;
  onComplete?: (code: string) => void;
  ariaLabel?: string;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  const setAt = (index: number, char: string) => {
    const arr = Array.from({ length }, (_, i) => value[i] ?? "");
    arr[index] = char;
    const next = arr.join("").slice(0, length);
    onChange(next);
    return next;
  };

  const focusBox = (index: number) => {
    const el = refs.current[Math.max(0, Math.min(length - 1, index))];
    el?.focus();
  };

  const handleChange = (index: number, raw: string) => {
    // Keep only the last typed digit; ignore non-digits.
    const clean = raw.replace(/\D/g, "");
    if (!clean) {
      setAt(index, "");
      return;
    }
    const digit = clean[clean.length - 1];
    const next = setAt(index, digit);
    if (index < length - 1) focusBox(index + 1);
    if (next.length === length) onComplete?.(next);
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (value[index]) {
        setAt(index, "");
      } else if (index > 0) {
        setAt(index - 1, "");
        focusBox(index - 1);
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      focusBox(index - 1);
    } else if (e.key === "ArrowRight" && index < length - 1) {
      e.preventDefault();
      focusBox(index + 1);
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, length);
    if (!pasted) return;
    onChange(pasted);
    focusBox(Math.min(pasted.length, length - 1));
    if (pasted.length === length) onComplete?.(pasted);
  };

  return (
    <div className="flex items-center justify-center gap-2" role="group" aria-label={ariaLabel}>
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          disabled={disabled}
          value={digit}
          aria-label={`Digit ${i + 1} of ${length}`}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          className={cn(
            "h-12 w-11 rounded-xl border border-line bg-surface text-center text-[20px] font-bold text-ink outline-none transition-all",
            disabled && "opacity-60"
          )}
        />
      ))}
    </div>
  );
}
