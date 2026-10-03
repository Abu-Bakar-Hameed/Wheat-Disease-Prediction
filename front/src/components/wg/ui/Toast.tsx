"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./Icon";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastOptions {
  title?: ReactNode;
  message?: ReactNode;
  duration?: number;
  /** Show a persistent progress bar; default true when duration set. */
  progress?: boolean;
}

export interface ToastItem extends ToastOptions {
  id: number;
  type: ToastType;
}

type ToastApi = {
  show: (type: ToastType, options: ToastOptions | ReactNode) => number;
  success: (options: ToastOptions | ReactNode) => number;
  error: (options: ToastOptions | ReactNode) => number;
  warning: (options: ToastOptions | ReactNode) => number;
  info: (options: ToastOptions | ReactNode) => number;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const DEFAULT_DURATION = 4500;

// SSR-safe mount gate: returns false on the server (and during hydration) then
// true on the client, so the portal never renders markup the server HTML lacks.
const subscribeNoop = () => () => {};
function useMounted() {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false
  );
}

const TONE: Record<ToastType, { icon: string; ring: string; bar: string; iconColor: string }> = {
  success: { icon: "check_circle", ring: "border-l-success", bar: "bg-success", iconColor: "text-success" },
  error: { icon: "error", ring: "border-l-danger", bar: "bg-danger", iconColor: "text-danger" },
  warning: { icon: "warning", ring: "border-l-warning", bar: "bg-warning", iconColor: "text-warning" },
  info: { icon: "info", ring: "border-l-info", bar: "bg-info", iconColor: "text-info" },
};

function normalize(options: ToastOptions | ReactNode): ToastOptions {
  if (typeof options === "object" && options !== null && ("title" in options || "message" in options || "duration" in options)) {
    return options as ToastOptions;
  }
  return { message: options as ReactNode };
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const mounted = useMounted();

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (type: ToastType, options: ToastOptions | ReactNode) => {
      const opts = normalize(options);
      const id = ++idRef.current;
      const duration = opts.duration ?? DEFAULT_DURATION;
      setToasts((list) => [...list, { ...opts, id, type }].slice(-5));
      if (duration > 0) {
        window.setTimeout(() => dismiss(id), duration);
      }
      return id;
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (o) => show("success", o),
      error: (o) => show("error", o),
      warning: (o) => show("warning", o),
      info: (o) => show("info", o),
      dismiss,
    }),
    [show, dismiss]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {mounted &&
        createPortal(<ToastViewport toasts={toasts} onDismiss={dismiss} />, document.body)}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      show: () => -1,
      success: () => -1,
      error: () => -1,
      warning: () => -1,
      info: () => -1,
      dismiss: () => {},
    };
  }
  return ctx;
}

function ToastViewport({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-3 sm:inset-x-auto sm:right-0 sm:bottom-0 sm:items-end sm:p-4"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const tone = TONE[toast.type];
  const duration = toast.duration ?? DEFAULT_DURATION;
  const [paused, setPaused] = useState(false);

  return (
    <div
      role="status"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={cn(
        "pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-lg border border-line border-l-4 bg-surface shadow-lg animate-toast-in",
        tone.ring
      )}
    >
      <div className="flex items-start gap-3 p-3.5 pr-9">
        <Icon name={tone.icon} size={20} className={cn("mt-0.5 shrink-0", tone.iconColor)} />
        <div className="min-w-0 flex-1">
          {toast.title && <p className="text-sm font-semibold text-ink">{toast.title}</p>}
          {toast.message && (
            <div className={cn("text-sm text-muted", toast.title && "mt-0.5")}>{toast.message}</div>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-ink"
      >
        <Icon name="close" size={16} />
      </button>
      {duration > 0 && toast.progress !== false && (
        <ProgressBar duration={duration} paused={paused} />
      )}
    </div>
  );
}

function ProgressBar({ duration, paused }: { duration: number; paused: boolean }) {
  const [width, setWidth] = useState(100);

  useEffect(() => {
    if (paused) return;
    const start = Date.now();
    const remaining = Math.max(1, (width / 100) * duration);
    const tick = window.setInterval(() => {
      const pct = Math.max(0, 100 - ((Date.now() - start) / remaining) * 100);
      setWidth(pct);
      if (pct <= 0) window.clearInterval(tick);
    }, 50);
    return () => window.clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  return (
    <div className="absolute bottom-0 left-0 h-0.5 w-full bg-line/60">
      <div className="h-full bg-brand-500/70" style={{ width: `${width}%`, transition: "width 60ms linear" }} />
    </div>
  );
}
