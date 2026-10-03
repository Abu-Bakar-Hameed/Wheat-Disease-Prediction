"use client";

/**
 * AssistantLauncher — mounts once in the user dashboard shell (never admin).
 *
 * Owns the open/closed state of the built-in assistant and renders it in the
 * layout the user picked under Settings → Appearance → Chatbot Layout. There is
 * exactly ONE chatbot instance; only its presentation changes (spec §31). The
 * panel is unmounted on close, so its in-memory history is discarded — nothing
 * is persisted (spec §5/§25).
 *
 * On small screens every style degrades to a full-screen (or near-full sheet)
 * experience so nothing overflows and the controls stay reachable (spec §21/§22).
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ASSISTANT_LAUNCH_EVENT } from "./assistantEvents";
import { AssistantChatPanel } from "./AssistantChatPanel";
import { RESIZE_HANDLES, useChatbotWindow } from "./useChatbotWindow";
import { useUserSettings } from "@/lib/useUserSettings";
import {
  OVERLAY_CLASS,
  PANEL_HEIGHT_PX,
  PANEL_WIDTH_PX,
  RADIUS_PX,
  resolveAppearance,
  type AppearanceSettings,
} from "@/lib/appearance";

/** Track whether we're at/above the Tailwind `sm` breakpoint. */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isDesktop;
}

function heightValue(a: AppearanceSettings): string {
  if (a.panel_height === "full") return "calc(100vh - 2rem)";
  return `${PANEL_HEIGHT_PX[a.panel_height]}px`;
}

interface PanelGeometry {
  className: string;
  style: CSSProperties;
  backdrop: string;
  clickToClose: boolean;
}

/** Desktop layout for each open style (spec §7/§8). */
function geometryFor(a: AppearanceSettings): PanelGeometry {
  const r = RADIUS_PX[a.border_radius];
  const width = `min(${PANEL_WIDTH_PX[a.panel_width]}px, 92vw)`;
  const shadow = "0 20px 50px -12px rgba(15,23,42,0.35)";
  const clickOverlay = a.overlay !== "none";

  switch (a.chatbot_open_style) {
    case "left_sidebar":
      return {
        className: "absolute top-0 left-0 bottom-0",
        style: { width, borderRadius: `0 ${r}px ${r}px 0`, boxShadow: shadow },
        backdrop: OVERLAY_CLASS[a.overlay],
        clickToClose: clickOverlay,
      };
    case "split":
      return {
        className: "absolute top-0 right-0 bottom-0",
        style: { width, borderRadius: `${r}px 0 0 ${r}px`, boxShadow: shadow },
        backdrop: "bg-transparent",
        clickToClose: false,
      };
    case "center_modal":
      return {
        className: "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
        style: { width, height: heightValue(a), borderRadius: r, boxShadow: shadow },
        backdrop: OVERLAY_CLASS[a.overlay],
        clickToClose: clickOverlay,
      };
    case "bottom_sheet":
      return {
        className: "absolute bottom-0 left-0 right-0 mx-auto",
        style: {
          width: "min(640px, 100vw)",
          height: heightValue(a),
          borderRadius: `${r}px ${r}px 0 0`,
          boxShadow: shadow,
        },
        backdrop: OVERLAY_CLASS[a.overlay],
        clickToClose: clickOverlay,
      };
    case "floating":
      return {
        className: "absolute bottom-6 right-6",
        style: { width, height: heightValue(a), borderRadius: r, boxShadow: shadow },
        backdrop: OVERLAY_CLASS[a.overlay],
        clickToClose: clickOverlay,
      };
    case "fullscreen":
      return {
        className: "absolute inset-0",
        style: { borderRadius: 0 },
        backdrop: "bg-transparent",
        clickToClose: false,
      };
    case "right_sidebar":
    default:
      return {
        className: "absolute top-0 right-0 bottom-0",
        style: { width, borderRadius: `${r}px 0 0 ${r}px`, boxShadow: shadow },
        backdrop: OVERLAY_CLASS[a.overlay],
        clickToClose: clickOverlay,
      };
  }
}

export function AssistantLauncher() {
  const [open, setOpen] = useState(false);
  const { settings } = useUserSettings();
  const isDesktop = useIsDesktop();
  const a = resolveAppearance(settings.appearance);
  const frameRef = useRef<HTMLDivElement>(null);

  // Drag/resize is a desktop-window affordance: it is off on small screens (where
  // the panel already collapses to full-screen / a sheet) and for the Full Screen
  // style, which has no frame to move. The signature binds the persisted rect to
  // the layout that produced it, so changing Chatbot Layout settings re-places
  // the window instead of leaving it where the old layout put it.
  const canWindow = isDesktop && a.chatbot_open_style !== "fullscreen";
  const layoutSignature = `${a.chatbot_open_style}|${a.panel_width}|${a.panel_height}`;
  const { rect, startDrag, startResize } = useChatbotWindow({
    signature: layoutSignature,
    enabled: canWindow && open,
    frameRef,
  });
  // A rect exists only once the user has moved/sized the window (or it was
  // restored for this layout), which is exactly when we own its coordinates.
  const isFree = rect !== null;

  useEffect(() => {
    const handleLaunch = () => setOpen((v) => !v);
    window.addEventListener(ASSISTANT_LAUNCH_EVENT, handleLaunch);
    return () => window.removeEventListener(ASSISTANT_LAUNCH_EVENT, handleLaunch);
  }, []);

  if (!open) return null;

  const close = () => setOpen(false);

  const geo = geometryFor(a);
  // Mobile: everything collapses to a full-screen view (or a tall bottom sheet).
  const panelClass = isDesktop
    ? geo.className
    : a.chatbot_open_style === "bottom_sheet"
      ? "absolute inset-x-0 bottom-0 top-[8%]"
      : "absolute inset-0";
  const panelStyle: CSSProperties = isDesktop ? geo.style : { borderRadius: 0 };
  const showBackdrop = isDesktop ? geo.clickToClose : a.overlay !== "none" && a.chatbot_open_style !== "split" && a.chatbot_open_style !== "fullscreen";
  const backdropClass = isDesktop ? geo.backdrop : OVERLAY_CLASS[a.overlay];

  // Once dragged/resized the frame is placed by explicit coordinates instead of
  // the layout's edge classes. Radius + shadow are shared with the style-based
  // path so the window looks identical the moment it becomes free.
  const radius = panelStyle.borderRadius ?? 0;
  const frameStyle: CSSProperties = rect
    ? {
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        borderRadius: radius,
        boxShadow: panelStyle.boxShadow,
      }
    : panelStyle;

  return (
    // Wrapper ignores pointer events so layouts without a backdrop (Split View,
    // overlay: none) leave the dashboard behind fully usable. The frame and the
    // optional backdrop re-enable their own hit-testing.
    <div className="pointer-events-none fixed inset-0 z-50">
      {showBackdrop && (
        <button
          type="button"
          aria-label="Close assistant"
          onClick={close}
          className={`pointer-events-auto absolute inset-0 ${backdropClass}`}
        />
      )}
      {/* The frame must not carry `relative`: panelClass supplies `absolute`, and
          Tailwind's CSS order would let `relative` win, pinning every open style
          to the top-left of the wrapper. It is also deliberately NOT
          overflow-hidden, so the resize handles can sit on its outer edge. */}
      <div
        ref={frameRef}
        className={`pointer-events-auto absolute z-10 ${isFree ? "" : panelClass}`}
        style={frameStyle}
      >
        {/* Inner box clips to the rounded corners, exactly as before. */}
        <div className="h-full w-full overflow-hidden bg-white" style={{ borderRadius: radius }}>
          <AssistantChatPanel
            onClose={close}
            onHeaderPointerDown={canWindow ? startDrag : undefined}
          />
        </div>
        {isFree &&
          RESIZE_HANDLES.map((h) => (
            <div
              key={h.edge}
              aria-hidden="true"
              onPointerDown={(e) => startResize(e, h.edge)}
              className={`absolute touch-none ${h.className}`}
            />
          ))}
      </div>
    </div>
  );
}
