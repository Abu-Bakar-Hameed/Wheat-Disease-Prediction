import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
}

export function Card({ children, className, padding = true }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-gray-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900",
        padding && "p-5",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  icon,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start gap-3">
      {icon && (
        <div className="mt-0.5 flex-shrink-0 text-green-600 dark:text-green-400">
          {icon}
        </div>
      )}
      <div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-zinc-100">
          {title}
        </h3>
        {subtitle && (
          <p className="mt-0.5 text-sm text-gray-500 dark:text-zinc-400">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
