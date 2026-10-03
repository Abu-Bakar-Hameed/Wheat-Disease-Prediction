"use client";

import { forwardRef, useId } from "react";
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./Icon";

const FIELD_BASE =
  "w-full rounded-lg border bg-surface text-ink placeholder:text-muted/70 transition-[border-color,box-shadow,background-color] duration-200 ease-out focus:outline-none focus:ring-4 disabled:opacity-60 disabled:cursor-not-allowed";

function stateRing(error?: boolean) {
  return error
    ? "border-danger focus:border-danger focus:ring-danger/20"
    : "border-line hover:border-brand-300 focus:border-brand-500 focus:ring-brand-600/20";
}

export interface FieldWrapperProps {
  label?: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function Field({ label, htmlFor, hint, error, required, children, className }: FieldWrapperProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : (
        hint && <p className="text-xs text-muted">{hint}</p>
      )}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  leftIcon?: string;
  wrapperClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, leftIcon, className, wrapperClassName, id, required, ...rest },
  ref
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const control = (
    <div className="relative">
      {leftIcon && (
        <Icon
          name={leftIcon}
          size={18}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        />
      )}
      <input
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(
          FIELD_BASE,
          stateRing(!!error),
          "h-11 text-sm",
          leftIcon ? "pl-10 pr-3" : "px-3",
          className
        )}
        {...rest}
      />
    </div>
  );
  if (!label) return <div className={wrapperClassName}>{control}</div>;
  return (
    <Field label={label} htmlFor={inputId} hint={hint} error={error} required={required} className={wrapperClassName}>
      {control}
    </Field>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  wrapperClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, className, wrapperClassName, id, required, rows = 4, ...rest },
  ref
) {
  const autoId = useId();
  const areaId = id ?? autoId;
  const control = (
    <textarea
      ref={ref}
      id={areaId}
      rows={rows}
      required={required}
      aria-invalid={error ? true : undefined}
      className={cn(FIELD_BASE, stateRing(!!error), "px-3 py-2.5 text-sm resize-y", className)}
      {...rest}
    />
  );
  if (!label) return <div className={wrapperClassName}>{control}</div>;
  return (
    <Field label={label} htmlFor={areaId} hint={hint} error={error} required={required} className={wrapperClassName}>
      {control}
    </Field>
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  wrapperClassName?: string;
  children: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, className, wrapperClassName, id, required, children, ...rest },
  ref
) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const control = (
    <div className="relative">
      <select
        ref={ref}
        id={selectId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(
          FIELD_BASE,
          stateRing(!!error),
          "h-11 pl-3 pr-9 text-sm appearance-none cursor-pointer",
          className
        )}
        {...rest}
      >
        {children}
      </select>
      <Icon
        name="expand_more"
        size={20}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted"
      />
    </div>
  );
  if (!label) return <div className={wrapperClassName}>{control}</div>;
  return (
    <Field label={label} htmlFor={selectId} hint={hint} error={error} required={required} className={wrapperClassName}>
      {control}
    </Field>
  );
});

export interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  description?: ReactNode;
}

export function Checkbox({ label, description, className, id, ...rest }: CheckboxProps) {
  const autoId = useId();
  const boxId = id ?? autoId;
  return (
    <label htmlFor={boxId} className={cn("flex items-start gap-2.5 cursor-pointer select-none", className)}>
      <input
        id={boxId}
        type="checkbox"
        className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded-md border-line text-brand-700 focus:ring-brand-600/30 focus:ring-4"
        {...rest}
      />
      {(label || description) && (
        <span className="text-sm leading-tight">
          {label && <span className="font-medium text-ink">{label}</span>}
          {description && <span className="mt-0.5 block text-muted">{description}</span>}
        </span>
      )}
    </label>
  );
}

export interface RadioProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  description?: ReactNode;
}

export function Radio({ label, description, className, id, ...rest }: RadioProps) {
  const autoId = useId();
  const radioId = id ?? autoId;
  return (
    <label htmlFor={radioId} className={cn("flex items-start gap-2.5 cursor-pointer select-none", className)}>
      <input
        id={radioId}
        type="radio"
        className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer border-line text-brand-700 focus:ring-brand-600/30 focus:ring-4"
        {...rest}
      />
      {(label || description) && (
        <span className="text-sm leading-tight">
          {label && <span className="font-medium text-ink">{label}</span>}
          {description && <span className="mt-0.5 block text-muted">{description}</span>}
        </span>
      )}
    </label>
  );
}
