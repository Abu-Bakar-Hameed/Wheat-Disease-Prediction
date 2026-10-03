"use client";

/**
 * AssistantChatPreview — a miniature of the real assistant used inside
 * Settings → Appearance. It consumes the SAME token resolvers as the live chat
 * panel (radius, density, bubble width, colors, header/input styles), so what
 * you preview is genuinely what the chatbot renders (spec §19/§20).
 *
 * It is static and non-interactive by design.
 */

import {
  BUBBLE_MAXW_CLASS,
  BUBBLE_RADIUS_CLASS,
  DENSITY_METRICS,
  OVERLAY_CLASS,
  RADIUS_PX,
  ensureContrast,
  readableTextOn,
  type AppearanceSettings,
} from "@/lib/appearance";

/** Positioning + sizing of the mini panel inside the preview frame, per style. */
function frameFor(a: AppearanceSettings): { box: string; scrim: boolean } {
  switch (a.chatbot_open_style) {
    case "left_sidebar":
      return { box: "absolute left-0 top-0 bottom-0 w-[58%]", scrim: a.overlay !== "none" };
    case "right_sidebar":
      return { box: "absolute right-0 top-0 bottom-0 w-[58%]", scrim: a.overlay !== "none" };
    case "split":
      return { box: "absolute right-0 top-0 bottom-0 w-[52%]", scrim: false };
    case "center_modal":
      return { box: "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[64%] h-[82%]", scrim: a.overlay !== "none" };
    case "bottom_sheet":
      return { box: "absolute bottom-0 left-0 right-0 h-[72%]", scrim: a.overlay !== "none" };
    case "floating":
      return { box: "absolute bottom-[8%] right-[8%] w-[62%] h-[74%]", scrim: a.overlay !== "none" };
    case "fullscreen":
    default:
      return { box: "absolute inset-0", scrim: false };
  }
}

export function AssistantChatPreview({ appearance: a }: { appearance: AppearanceSettings }) {
  const density = DENSITY_METRICS[a.chat_density];
  const bubbleRadius = BUBBLE_RADIUS_CLASS[a.message_style];
  const bubbleMaxW = BUBBLE_MAXW_CLASS[a.message_bubble_width];
  const { box, scrim } = frameFor(a);

  const r = RADIUS_PX[a.border_radius];
  const roundedCorners =
    a.chatbot_open_style === "right_sidebar" || a.chatbot_open_style === "split"
      ? `${r}px 0 0 ${r}px`
      : a.chatbot_open_style === "left_sidebar"
        ? `0 ${r}px ${r}px 0`
        : a.chatbot_open_style === "bottom_sheet"
          ? `${r}px ${r}px 0 0`
          : a.chatbot_open_style === "fullscreen"
            ? 0
            : r;

  const headerSolid = a.header_style !== "minimal";
  const headerBg = headerSolid ? a.chatbot_color : "#ffffff";
  const headerFg = headerSolid
    ? ensureContrast(a.chatbot_color, readableTextOn(a.chatbot_color))
    : "#1e293b";
  const headerPad = a.compact_header ? "px-2.5 py-1.5" : "px-3 py-2.5";
  const headerExtra =
    a.header_style === "elevated"
      ? "shadow-sm border-b border-black/5"
      : a.header_style === "minimal"
        ? "border-b border-slate-100"
        : "";

  const inputRadius = a.input_rounded ? "rounded-full" : "rounded-lg";
  const inputBorder = a.input_border ? "border border-slate-200" : "border border-transparent";

  return (
    <div className="relative h-[260px] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 select-none">
      {scrim && <div className={`absolute inset-0 ${OVERLAY_CLASS[a.overlay]}`} />}
      <div
        className={`flex flex-col overflow-hidden bg-white shadow-lg ${box}`}
        style={{ borderRadius: roundedCorners }}
        aria-hidden="true"
      >
        {/* Header */}
        <div
          className={`flex items-center gap-1.5 ${headerPad} ${headerExtra}`}
          style={{ backgroundColor: headerBg, color: headerFg }}
        >
          {a.show_ai_icon && (
            <span className="material-symbols-outlined shrink-0" style={{ fontSize: 14 }}>
              smart_toy
            </span>
          )}
          {a.show_chatbot_name && (
            <span className="text-[11px] font-bold truncate">WheatGuard Assistant</span>
          )}
          <span className="material-symbols-outlined ml-auto" style={{ fontSize: 13 }}>
            close
          </span>
        </div>

        {/* Messages */}
        <div
          className={`flex-1 min-h-0 overflow-hidden px-2.5 py-2.5 ${density.list}`}
          style={{ backgroundColor: a.background_color }}
        >
          <div className={`flex items-end ${density.gap}`}>
            {a.show_ai_icon && (
              <span
                className="material-symbols-outlined w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: a.chatbot_color, color: readableTextOn(a.chatbot_color), fontSize: 10 }}
              >
                smart_toy
              </span>
            )}
            <div
              className={`${bubbleMaxW} ${bubbleRadius} ${density.pad} border border-black/[0.06] shadow-sm leading-snug`}
              style={{ backgroundColor: a.ai_message_color, color: readableTextOn(a.ai_message_color), fontSize: 11 }}
            >
              Hello! How can I help with your wheat crops?
            </div>
          </div>
          <div className={`flex justify-end ${density.gap}`}>
            <div
              className={`${bubbleMaxW} ${bubbleRadius} ${density.pad} border border-black/[0.06] shadow-sm leading-snug`}
              style={{ backgroundColor: a.user_message_color, color: readableTextOn(a.user_message_color), fontSize: 11 }}
            >
              My leaves have brown spots.
            </div>
          </div>
          <div className={`flex items-end ${density.gap}`}>
            {a.show_ai_icon && (
              <span
                className="material-symbols-outlined w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: a.chatbot_color, color: readableTextOn(a.chatbot_color), fontSize: 10 }}
              >
                smart_toy
              </span>
            )}
            <div
              className={`${bubbleMaxW} ${bubbleRadius} ${density.pad} border border-black/[0.06] shadow-sm leading-snug`}
              style={{ backgroundColor: a.ai_message_color, color: readableTextOn(a.ai_message_color), fontSize: 11 }}
            >
              That could be leaf rust — let&apos;s check it.
            </div>
          </div>
        </div>

        {/* Composer */}
        <div className="border-t border-slate-200 bg-white p-2">
          <div className="flex items-center gap-1.5">
            <div
              className={`flex-1 px-2.5 py-1.5 text-[11px] text-slate-400 truncate bg-white ${inputRadius} ${inputBorder}`}
            >
              Type a message…
            </div>
            {a.send_button_style === "minimal" ? (
              <span
                className="material-symbols-outlined p-1.5"
                style={{ color: a.chatbot_color, fontSize: 16 }}
              >
                send
              </span>
            ) : a.send_button_style === "outline" ? (
              <span
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-semibold"
                style={{ borderColor: a.chatbot_color, color: a.chatbot_color }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>
                  send
                </span>
                Send
              </span>
            ) : a.send_button_style === "filled" ? (
              <span
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold"
                style={{ backgroundColor: a.chatbot_color, color: readableTextOn(a.chatbot_color) }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>
                  send
                </span>
                Send
              </span>
            ) : (
              <span
                className="material-symbols-outlined p-1.5 rounded-full flex items-center justify-center"
                style={{ backgroundColor: a.chatbot_color, color: readableTextOn(a.chatbot_color), fontSize: 14 }}
              >
                send
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
