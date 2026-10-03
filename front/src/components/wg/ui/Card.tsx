"use client";

import { forwardRef } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  /** hover lifts + border tint — for clickable cards. */
  interactive?: boolean;
  padded?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { children, className, interactive = false, padded = false, ...rest },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn(
        "bg-surface border border-line rounded-xl shadow-card",
        padded && "p-5 sm:p-6",
        interactive &&
          "transition-[box-shadow,transform,border-color] duration-200 ease-out hover:shadow-md hover:border-brand-200 hover:-translate-y-0.5",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
});

export function CardHeader({
  title,
  subtitle,
  icon,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 p-5 sm:p-6 pb-0", className)}>
      <div className="flex items-start gap-3 min-w-0">
        {icon && (
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-ink truncate">{title}</h3>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("p-5 sm:p-6", className)}>{children}</div>;
}

export function CardFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 px-5 sm:px-6 py-4 border-t border-line", className)}>
      {children}
    </div>
  );
}
