import { AlertTriangle, CheckCircle, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type AlertVariant = "info" | "success" | "warning" | "error";

const CONFIG: Record<
  AlertVariant,
  { icon: React.ReactNode; classes: string }
> = {
  info: {
    icon: <Info className="h-4 w-4" />,
    classes: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-200",
  },
  success: {
    icon: <CheckCircle className="h-4 w-4" />,
    classes: "bg-green-50 border-green-200 text-green-800 dark:bg-green-950 dark:border-green-800 dark:text-green-200",
  },
  warning: {
    icon: <AlertTriangle className="h-4 w-4" />,
    classes: "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-950 dark:border-yellow-800 dark:text-yellow-200",
  },
  error: {
    icon: <XCircle className="h-4 w-4" />,
    classes: "bg-red-50 border-red-200 text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-200",
  },
};

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  message: string;
  className?: string;
}

export function Alert({ variant = "info", title, message, className }: AlertProps) {
  const { icon, classes } = CONFIG[variant];
  return (
    <div
      role="alert"
      className={cn(
        "flex gap-3 rounded-lg border p-4 text-sm",
        classes,
        className
      )}
    >
      <span className="mt-0.5 flex-shrink-0">{icon}</span>
      <div>
        {title && <p className="mb-1 font-semibold">{title}</p>}
        <p>{message}</p>
      </div>
    </div>
  );
}
