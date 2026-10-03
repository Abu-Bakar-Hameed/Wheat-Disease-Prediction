"use client";

/**
 * AssistantChatPanel — the single built-in AI assistant.
 *
 * A compact chat surface launched from the "+" button in the user header.
 * It talks only to the server-side OpenRouter route (`sendChat` → POST
 * /api/v1/assistant/chat). No API keys, no model/provider selection and no
 * conversation persistence live here — history is held in component state and
 * cleared when the panel closes (spec §5/§18/§25).
 *
 * Feature availability (voice / image / recent predictions) is read from the
 * user's settings so the toggles actually gate the UI; the same rules are
 * enforced again server-side (spec §12/§13/§17/§26).
 *
 * Everything about *how it looks* comes from `appearance.ts` — the same token
 * resolvers drive the live preview, so this is the real chatbot's appearance,
 * not an imitation (spec §20/§28/§33).
 */

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  fetchHistory,
  fetchSuggestedQuestions,
  sendChat,
  type ChatMessage,
} from "@/lib/api";
import { useUserSettings } from "@/lib/useUserSettings";
import { emitAssistantReplied } from "./assistantEvents";
import {
  BUBBLE_MAXW_CLASS,
  BUBBLE_RADIUS_CLASS,
  DENSITY_METRICS,
  FONT_SIZE_PX,
  ensureContrast,
  ensureContrastOnWhite,
  readableTextOn,
  resolveAppearance,
} from "@/lib/appearance";

/* ── Speech recognition (vendor-prefixed, optional API) ─────────────────── */

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult:
    | ((event: { results?: ArrayLike<ArrayLike<{ transcript: string }>> }) => void)
    | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Downscale a picked image to a JPEG data-URL (keeps payloads small). */
function resizeImageToDataUrl(file: File, maxDim = 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the image."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not read the image."));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas is not available."));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function nowIso() {
  return new Date().toISOString();
}

/* ── Component ──────────────────────────────────────────────────────────── */

export function AssistantChatPanel({
  onClose,
  onHeaderPointerDown,
}: {
  onClose: () => void;
  /**
   * When provided, the purple header becomes the window drag handle (wired up by
   * `AssistantLauncher` → `useChatbotWindow`). Omitted on small screens and for
   * the full-screen layout, where there is no window to move.
   */
  onHeaderPointerDown?: (e: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  const { settings } = useUserSettings();
  const voiceEnabled = settings.voice_enabled !== false;
  const imageEnabled = settings.image_upload_enabled !== false;
  const predictionsEnabled = settings.recent_predictions_enabled !== false;

  const a = resolveAppearance(settings.appearance);
  const density = DENSITY_METRICS[a.chat_density];
  const bubbleRadius = BUBBLE_RADIUS_CLASS[a.message_style];
  const bubbleMaxW = BUBBLE_MAXW_CLASS[a.message_bubble_width];
  const fontSize = FONT_SIZE_PX[a.font_size];

  const chatbotText = readableTextOn(a.chatbot_color);
  const userText = readableTextOn(a.user_message_color);
  const aiText = readableTextOn(a.ai_message_color);
  const headerSolid = a.header_style !== "minimal";
  // Contrast-guaranteed header foreground: `readableTextOn`'s hard white/ink
  // flip can still land close to a dark accent (black title on a near-black
  // header), which rendered as an empty black band.
  const headerFg = headerSolid
    ? ensureContrast(a.chatbot_color, chatbotText)
    : ensureContrast("#ffffff", "#1e293b");
  // Hairline edge so bubbles stay visible even when a light bubble color sits
  // on a light background (e.g. white AI bubble on the default #f8fafc).
  const bubbleEdge = "border border-black/[0.06] shadow-sm";

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  /* Auto-scroll to the newest message. */
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  /* Load suggestion chips once. */
  useEffect(() => {
    let alive = true;
    fetchSuggestedQuestions()
      .then((s) => {
        if (alive) setSuggestions(s.slice(0, 6));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  /* Focus the composer on open. */
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  /* Auto-grow the composer when the setting is on (bounded, never overflows). */
  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    if (a.input_auto_grow) {
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
    } else {
      ta.style.height = "";
    }
  }, [input, a.input_auto_grow]);

  /* Escape closes the panel (spec §28). */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** Build the request context — only includes the recent prediction when the
   *  feature is enabled and a latest scan exists. */
  const buildContext = async (): Promise<Record<string, unknown>> => {
    const context: Record<string, unknown> = {};
    if (!predictionsEnabled) return context;
    try {
      const { items } = await fetchHistory({ page: 1, limit: 1 });
      const latest = items?.[0];
      if (latest) {
        context.last_prediction = {
          prediction: latest.predicted_class,
          confidence_percentage: latest.confidence_pct,
          severity: latest.severity,
          recommendation: latest.recommendation ?? "N/A",
        };
        if (latest.ai_report) context.ai_report = latest.ai_report;
      }
    } catch {
      /* Non-fatal — chat works without the prediction context. */
    }
    return context;
  };

  const handleSend = async (preset?: string) => {
    const text = (preset ?? input).trim();
    if ((!text && !pendingImage) || sending) return;
    setError("");

    const userMsg: ChatMessage = {
      role: "user",
      content: text,
      timestamp: nowIso(),
      ...(pendingImage ? { image: pendingImage } : {}),
    };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput("");
    setPendingImage(null);
    setSending(true);

    try {
      const context = await buildContext();
      const res = await sendChat({
        messages: history.map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
          ...(m.image ? { image: m.image } : {}),
        })),
        context,
      });
      setMessages((m) => [...m, res.message]);
      // The server wrote the bell notification before returning this reply, so
      // the bell can re-fetch now rather than on its next poll.
      emitAssistantReplied();
    } catch (err) {
      // Roll back the optimistic bubble so the user can retry cleanly.
      setMessages(messages);
      setInput(text);
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handlePickFile = async (file: File) => {
    setError("");
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setError("Only JPEG, PNG, WebP or GIF images are supported.");
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      setPendingImage(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not attach the image.");
    } finally {
      setUploading(false);
    }
  };

  const startVoice = () => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setError("Voice input is not supported in this browser.");
      return;
    }
    try {
      const rec = new Ctor();
      rec.lang = "en-US";
      rec.interimResults = false;
      rec.continuous = false;
      rec.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript ?? "";
        if (transcript) setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
      };
      rec.onend = () => setListening(false);
      setListening(true);
      rec.start();
    } catch {
      setListening(false);
      setError("Could not start voice input.");
    }
  };

  const hasChat = messages.length > 0;

  const headerBg = headerSolid ? a.chatbot_color : "#ffffff";
  const headerPad = a.compact_header ? "px-3 py-2" : "px-4 py-3";
  const headerExtra =
    a.header_style === "elevated"
      ? "shadow-md border-b border-black/5"
      : a.header_style === "minimal"
        ? "border-b border-slate-100"
        : "";

  const inputRadius = a.input_rounded ? "rounded-full" : "rounded-lg";
  const inputBorder = a.input_border ? "border border-slate-200" : "border border-transparent";

  const sendLabel = a.send_button_style === "filled" || a.send_button_style === "outline";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="WheatGuard AI Assistant"
      className="flex h-full w-full flex-col bg-white"
    >
      {/* Header — the drag handle. The hook ignores pointer-downs that land on a
          control, so the close button keeps working normally. */}
      <div
        onPointerDown={onHeaderPointerDown}
        title={onHeaderPointerDown ? "Drag the header to move the window" : undefined}
        className={`flex items-center gap-2.5 shrink-0 ${headerPad} ${headerExtra} ${
          onHeaderPointerDown ? "cursor-grab touch-none select-none active:cursor-grabbing" : ""
        }`}
        style={{ backgroundColor: headerBg, color: headerFg }}
      >
        {a.show_ai_icon && (
          <span className="material-symbols-outlined shrink-0" style={{ fontSize: 20 }}>
            smart_toy
          </span>
        )}
        {a.show_chatbot_name && (
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold leading-tight truncate">WheatGuard Assistant</p>
            <p className="text-[11px] opacity-80 leading-tight">Powered by OpenRouter</p>
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close assistant"
          title="Close"
          className={`ml-auto p-1.5 rounded-lg transition focus:outline-none focus-visible:ring-2 ${
            headerSolid ? "hover:bg-white/20 focus-visible:ring-white" : "hover:bg-black/5 focus-visible:ring-slate-400"
          }`}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
            close
          </span>
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        aria-live="polite"
        className={`flex-1 min-h-0 overflow-y-auto px-3.5 py-4 ${density.list}`}
        style={{ backgroundColor: a.background_color }}
      >
        {!hasChat && (
          <div className={density.list}>
            <div className={`flex items-end ${density.gap}`}>
              {a.show_ai_icon && (
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: a.chatbot_color, color: chatbotText }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                    smart_toy
                  </span>
                </div>
              )}
              <div
                className={`${bubbleMaxW} ${bubbleRadius} ${density.pad} ${bubbleEdge} leading-relaxed`}
                style={{ backgroundColor: a.ai_message_color, color: aiText, fontSize }}
              >
                How can I help you today?
              </div>
            </div>
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {suggestions.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void handleSend(q)}
                    disabled={sending}
                    className="px-3 py-1.5 rounded-full border text-[12.5px] font-medium transition hover:brightness-95 disabled:opacity-50"
                    style={{
                      borderColor: ensureContrastOnWhite(a.chatbot_color),
                      color: ensureContrastOnWhite(a.chatbot_color),
                      backgroundColor: "#ffffff",
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((msg, i) => {
          const mine = msg.role === "user";
          return (
            <div key={`${msg.timestamp}-${i}`} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`${bubbleMaxW} ${mine ? "" : `flex items-end ${density.gap}`}`}>
                {!mine && a.show_ai_icon && (
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                    style={{ backgroundColor: a.chatbot_color, color: chatbotText }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                      smart_toy
                    </span>
                  </div>
                )}
                <div className="min-w-0">
                  {msg.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={msg.image}
                      alt="Attached"
                      className={`mb-1.5 ${mine ? "ml-auto" : ""} w-28 h-28 object-cover border border-black/10`}
                      style={{ borderRadius: a.message_style === "square" ? 6 : 12 }}
                    />
                  )}
                  {msg.content && (
                    <div
                      className={`${bubbleRadius} ${density.pad} ${bubbleEdge} leading-relaxed whitespace-pre-wrap break-words`}
                      style={{
                        backgroundColor: mine ? a.user_message_color : a.ai_message_color,
                        color: mine ? userText : aiText,
                        fontSize,
                      }}
                    >
                      {msg.content}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {sending && (
          <div className={`flex items-end ${density.gap}`}>
            {a.show_ai_icon && (
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: a.chatbot_color, color: chatbotText }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                  smart_toy
                </span>
              </div>
            )}
            <div
              className={`${bubbleRadius} ${density.pad} ${bubbleEdge}`}
              style={{ backgroundColor: a.ai_message_color }}
            >
              <span className="inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "0.15s" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "0.3s" }} />
              </span>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="px-3.5 pt-2">
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700 dark:border-red-800/50 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        </div>
      )}

      {/* Composer */}
      <div className="border-t border-slate-200 bg-white p-3 shrink-0">
        {pendingImage && (
          <div className="mb-2 flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pendingImage}
              alt="Pending attachment"
              className="w-14 h-14 object-cover rounded-lg border border-slate-200"
            />
            <button
              type="button"
              onClick={() => setPendingImage(null)}
              aria-label="Remove image"
              title="Remove image"
              className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                close
              </span>
            </button>
          </div>
        )}

        <div className="flex items-end gap-1.5">
          {imageEnabled && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handlePickFile(file);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                title="Attach a photo"
                aria-label="Attach a photo"
                disabled={uploading || sending}
                onClick={() => fileRef.current?.click()}
                className="p-2.5 rounded-xl text-slate-500 hover:bg-slate-100 disabled:opacity-40 transition"
              >
                {uploading ? (
                  <span className="block h-4 w-4 rounded-full border-2 border-slate-300 border-t-slate-600 animate-spin" />
                ) : (
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                    image
                  </span>
                )}
              </button>
            </>
          )}

          {voiceEnabled && getSpeechRecognition() !== null && (
            <button
              type="button"
              title={listening ? "Listening…" : "Voice input"}
              aria-label={listening ? "Listening" : "Voice input"}
              onClick={startVoice}
              disabled={listening || sending}
              className={`p-2.5 rounded-xl transition ${
                listening ? "bg-red-50 text-red-600" : "text-slate-500 hover:bg-slate-100"
              } disabled:opacity-60`}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                mic
              </span>
            </button>
          )}

          <textarea
            ref={inputRef}
            value={input}
            rows={1}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            maxLength={4000}
            placeholder="Type a message…"
            aria-label="Message"
            disabled={sending}
            style={{ fontSize }}
            className={`flex-1 min-w-0 px-4 py-2.5 outline-none resize-none bg-white transition disabled:bg-slate-50 ${inputRadius} ${inputBorder} focus:ring-2 focus:ring-emerald-100 dark:focus:ring-emerald-900/60`}
          />

          {/* Send button — style varies, function never does (spec §18) */}
          {a.send_button_style === "minimal" ? (
            <button
              type="button"
              title="Send"
              aria-label="Send message"
              onClick={() => void handleSend()}
              disabled={sending || (!input.trim() && !pendingImage)}
              className="p-2.5 rounded-xl transition disabled:opacity-40"
              style={{ color: a.chatbot_color }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
                send
              </span>
            </button>
          ) : a.send_button_style === "outline" ? (
            <button
              type="button"
              title="Send"
              aria-label="Send message"
              onClick={() => void handleSend()}
              disabled={sending || (!input.trim() && !pendingImage)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border font-semibold text-[13px] transition disabled:opacity-40"
              style={{ borderColor: a.chatbot_color, color: a.chatbot_color }}
            >
              {sending ? (
                <span className="block h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
              ) : (
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  send
                </span>
              )}
              {sendLabel && !sending && "Send"}
            </button>
          ) : a.send_button_style === "filled" ? (
            <button
              type="button"
              title="Send"
              aria-label="Send message"
              onClick={() => void handleSend()}
              disabled={sending || (!input.trim() && !pendingImage)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold text-[13px] transition disabled:opacity-40"
              style={{ backgroundColor: a.chatbot_color, color: chatbotText }}
            >
              {sending ? (
                <span className="block h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              ) : (
                <>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                    send
                  </span>
                  Send
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              title="Send"
              aria-label="Send message"
              onClick={() => void handleSend()}
              disabled={sending || (!input.trim() && !pendingImage)}
              className="p-2.5 rounded-full text-white disabled:opacity-40 transition"
              style={{ backgroundColor: a.chatbot_color, color: chatbotText }}
            >
              {sending ? (
                <span className="block h-5 w-5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              ) : (
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                  send
                </span>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
