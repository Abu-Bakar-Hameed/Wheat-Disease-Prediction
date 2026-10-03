"use client";

/**
 * useChatbotWindow — gives the built-in assistant panel desktop-window
 * behaviour: drag it by its header, resize it from all four edges and four
 * corners, keep it inside the viewport, and remember the size/position.
 *
 * Native Pointer Events only — no drag/resize dependency added. While the
 * pointer is down the frame is moved by writing inline styles straight onto the
 * element, so the chat panel (message list, streaming replies, composer) never
 * re-renders per pointer move. React state is touched once when an interaction
 * starts — to switch the frame from class-based geometry to explicit
 * coordinates — and once when it ends, to persist the result.
 *
 * The stored rect is keyed by a layout signature so a window dragged out of,
 * say, "Center Modal" does not reappear in the wrong place after the user
 * changes the Chatbot Layout settings (those settings must keep working).
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

export interface WindowRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/** An interaction is either a header drag or one of the eight resize edges. */
export type InteractionMode = ResizeEdge | "drag";

/* ── Constraints (spec §3) ────────────────────────────────────────────────── */

export const MIN_W = 360;
export const MIN_H = 450;
const MAX_VW = 0.9;
const MAX_VH = 0.9;

/**
 * `wg_` prefix matches the app's other device-local UI prefs (`wg_role`,
 * `wg_avatar_url`). Window geometry is per-device chrome, not a user setting, so
 * it deliberately does NOT go through the Supabase `appearance` blob.
 */
const STORAGE_KEY = "wg_chatbot_window";

/* ── Pure geometry helpers ────────────────────────────────────────────────── */

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

function viewport() {
  return { vw: window.innerWidth, vh: window.innerHeight };
}

function limits() {
  const { vw, vh } = viewport();
  return {
    // On a very short/narrow window the viewport wins over the nominal minimum
    // so the panel can never grow past the screen (spec §4/§8).
    minW: Math.min(MIN_W, vw),
    minH: Math.min(MIN_H, vh),
    maxW: Math.max(1, Math.floor(vw * MAX_VW)),
    maxH: Math.max(1, Math.floor(vh * MAX_VH)),
  };
}

/** Clamp size to the limits and keep the whole frame inside the viewport. */
export function clampRect(r: WindowRect): WindowRect {
  const L = limits();
  const { vw, vh } = viewport();
  const w = clamp(r.w, L.minW, L.maxW);
  const h = clamp(r.h, L.minH, L.maxH);
  return {
    w,
    h,
    x: clamp(r.x, 0, Math.max(0, vw - w)),
    y: clamp(r.y, 0, Math.max(0, vh - h)),
  };
}

/** Apply a pointer delta for the given mode, anchoring the opposite edge. */
export function applyDelta(
  mode: InteractionMode,
  start: WindowRect,
  dx: number,
  dy: number
): WindowRect {
  if (mode === "drag") {
    return clampRect({ ...start, x: start.x + dx, y: start.y + dy });
  }

  const L = limits();
  let { x, y, w, h } = start;

  if (mode.includes("e")) w = clamp(start.w + dx, L.minW, L.maxW);
  if (mode.includes("w")) {
    w = clamp(start.w - dx, L.minW, L.maxW);
    x = start.x + (start.w - w); // right edge stays put
  }
  if (mode.includes("s")) h = clamp(start.h + dy, L.minH, L.maxH);
  if (mode.includes("n")) {
    h = clamp(start.h - dy, L.minH, L.maxH);
    y = start.y + (start.h - h); // bottom edge stays put
  }

  return clampRect({ x, y, w, h });
}

/* ── Persistence (validated on read) ──────────────────────────────────────── */

function isRect(v: unknown): v is WindowRect {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (["x", "y", "w", "h"] as const).every(
    (k) => typeof r[k] === "number" && Number.isFinite(r[k] as number)
  );
}

export function loadWindow(signature: string): WindowRect | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { sig?: unknown; rect?: unknown };
    // A rect saved under a different layout, or holding junk, is discarded.
    if (parsed.sig !== signature || !isRect(parsed.rect)) return null;
    return clampRect(parsed.rect);
  } catch {
    return null;
  }
}

export function saveWindow(signature: string, rect: WindowRect) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sig: signature, rect }));
  } catch {
    /* private mode / quota — window simply won't be remembered */
  }
}

/* ── Resize handle geometry (spec §2) ─────────────────────────────────────── */

export const RESIZE_HANDLES: { edge: ResizeEdge; className: string }[] = [
  { edge: "n", className: "-top-1 left-3 right-3 h-2 cursor-ns-resize" },
  { edge: "s", className: "-bottom-1 left-3 right-3 h-2 cursor-ns-resize" },
  { edge: "w", className: "-left-1 top-3 bottom-3 w-2 cursor-ew-resize" },
  { edge: "e", className: "-right-1 top-3 bottom-3 w-2 cursor-ew-resize" },
  { edge: "nw", className: "-top-1.5 -left-1.5 h-3.5 w-3.5 cursor-nwse-resize" },
  { edge: "ne", className: "-top-1.5 -right-1.5 h-3.5 w-3.5 cursor-nesw-resize" },
  { edge: "sw", className: "-bottom-1.5 -left-1.5 h-3.5 w-3.5 cursor-nesw-resize" },
  { edge: "se", className: "-bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-nwse-resize" },
];

const CURSOR: Record<InteractionMode, string> = {
  drag: "grabbing",
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  ne: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
  sw: "nesw-resize",
};

/* ── Hook ─────────────────────────────────────────────────────────────────── */

interface Options {
  /** Layout identity; the stored rect only applies to the layout it came from. */
  signature: string;
  /** False on small screens / full-screen style, where windowing is disabled. */
  enabled: boolean;
  /** The element whose left/top/width/height are driven by the rect. */
  frameRef: RefObject<HTMLDivElement | null>;
}

export function useChatbotWindow({ signature, enabled, frameRef }: Options) {
  const [rect, setRect] = useState<WindowRect | null>(null);
  /**
   * Authoritative current rect, ahead of state while a pointer interaction is in
   * flight (pointer moves write it plus the DOM, never state). Reading it during
   * render is deliberately avoided: React only re-writes style properties whose
   * values changed between renders, so the still-stale `rect` below cannot
   * clobber the position the DOM already has.
   */
  const liveRef = useRef<WindowRect | null>(null);
  const active = useRef<{
    mode: InteractionMode;
    start: WindowRect;
    originX: number;
    originY: number;
    latest: WindowRect;
  } | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  const commit = useCallback((next: WindowRect | null) => {
    liveRef.current = next;
    setRect(next);
  }, []);

  // Restore the last size/position for this layout when the panel opens.
  useEffect(() => {
    const next = enabled ? loadWindow(signature) : null;
    queueMicrotask(() => commit(next));
    return () => stopRef.current?.();
  }, [enabled, signature, commit]);

  // Re-clamp when the viewport changes so a maximised window can't strand itself.
  useEffect(() => {
    if (!enabled) return;
    const onResize = () => {
      if (liveRef.current) commit(clampRect(liveRef.current));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [enabled, commit]);

  const begin = useCallback(
    (mode: InteractionMode, e: ReactPointerEvent) => {
      if (!enabled || e.defaultPrevented) return;
      const frame = frameRef.current;
      if (!frame) return;
      // Only primary pointer / touch; never steal a click from a control.
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (
        (e.target as HTMLElement).closest(
          "button, a, input, textarea, select, [data-no-drag]"
        )
      ) {
        return;
      }

      e.preventDefault();

      // Measure the live box, so a class-positioned panel (docked sidebar,
      // translated centre modal…) converts to the exact coordinates it occupies.
      const box = frame.getBoundingClientRect();
      const start = clampRect({ x: box.left, y: box.top, w: box.width, h: box.height });
      active.current = { mode, start, originX: e.clientX, originY: e.clientY, latest: start };
      commit(start);

      const body = document.body;
      const prevUserSelect = body.style.userSelect;
      const prevCursor = body.style.cursor;
      body.style.userSelect = "none"; // no accidental text selection
      body.style.cursor = CURSOR[mode];

      const onMove = (ev: PointerEvent) => {
        const it = active.current;
        if (!it) return;
        const next = applyDelta(it.mode, it.start, ev.clientX - it.originX, ev.clientY - it.originY);
        it.latest = next;
        liveRef.current = next;
        const el = frameRef.current;
        if (!el) return;
        el.style.left = `${next.x}px`;
        el.style.top = `${next.y}px`;
        el.style.width = `${next.w}px`;
        el.style.height = `${next.h}px`;
      };

      const stop = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        body.style.userSelect = prevUserSelect;
        body.style.cursor = prevCursor;
        stopRef.current = null;
      };

      const onUp = () => {
        const it = active.current;
        active.current = null;
        stop();
        if (it) {
          commit(it.latest);
          saveWindow(signature, it.latest);
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
      stopRef.current = stop;
    },
    [commit, enabled, frameRef, signature]
  );

  const startDrag = useCallback(
    (e: ReactPointerEvent) => begin("drag", e),
    [begin]
  );

  const startResize = useCallback(
    (e: ReactPointerEvent, edge: ResizeEdge) => begin(edge, e),
    [begin]
  );

  return { rect, startDrag, startResize, isFree: rect !== null };
}
