"use client";

/**
 * Appearance settings — the full, user-specific look-and-feel of the assistant
 * (spec §4–§20). Everything here is a normal USER setting (never admin), kept
 * separate from the Chatbot *feature* toggles (spec §34).
 *
 * Editing is local-first: changes update the working `draft` and the live
 * preview immediately, then a single Save persists the whole `appearance` object
 * to the backend (spec §27). Reset restores defaults after a confirmation
 * (spec §26). Colors are validated so malformed CSS never reaches the DOM
 * (spec §6/§24).
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchUserSettings, updateUserSettings } from "@/lib/api";
import { CHATBOT_COLORS, isHexColor, normalizeHex } from "@/lib/chatbotMeta";
import {
  APPEARANCE_DEFAULTS,
  BORDER_RADIUS_OPTIONS,
  BUBBLE_WIDTH_OPTIONS,
  COLOR_FIELDS,
  DENSITY_OPTIONS,
  FONT_SIZE_OPTIONS,
  HEADER_STYLE_OPTIONS,
  MESSAGE_STYLE_OPTIONS,
  OPEN_STYLE_OPTIONS,
  OVERLAY_OPTIONS,
  PANEL_HEIGHT_OPTIONS,
  PANEL_WIDTH_OPTIONS,
  SEND_BUTTON_OPTIONS,
  layoutControls,
  resolveAppearance,
  type AppearanceSettings,
} from "@/lib/appearance";
import { AssistantChatPreview } from "@/components/wg/assistant/AssistantChatPreview";
import { Banner, AutoSaveRow, SkeletonRows, ToggleRow, getErrorMessage } from "./shared";

/* ── Small building blocks ──────────────────────────────────────────────── */

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-5 first:border-0 first:pt-0">
      <h3 className="text-[14px] font-bold text-ink">{title}</h3>
      {hint && <p className="text-[12px] text-muted mt-0.5 mb-3">{hint}</p>}
      <div className={hint ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

interface Opt {
  value: string;
  label: string;
  icon?: string;
}

function RadioGroup<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  cols = 3,
}: {
  legend: string;
  name: string;
  options: readonly Opt[];
  value: T;
  onChange: (v: T) => void;
  cols?: 2 | 3 | 4;
}) {
  const gridClass =
    cols === 2 ? "grid-cols-2" : cols === 3 ? "grid-cols-3" : "grid-cols-4";
  return (
    <fieldset>
      <legend className="text-[13px] font-medium text-ink mb-2">{legend}</legend>
      <div className={`grid ${gridClass} gap-2`}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <label key={o.value} className="relative cursor-pointer">
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={active}
                onChange={() => onChange(o.value as T)}
                className="peer sr-only"
              />
              <span
                className={`flex flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2.5 text-center text-[12px] font-medium transition
                  peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500 peer-focus-visible:ring-offset-1
                  ${
                    active
                      ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                      : "border-line text-muted hover:bg-surface-muted"
                  }`}
              >
                {o.icon && (
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                    {o.icon}
                  </span>
                )}
                {o.label}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function ColorControl({
  label,
  description,
  value,
  fallback,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  fallback: string;
  onChange: (hex: string) => void;
}) {
  const [buffer, setBuffer] = useState<string | null>(null);
  const shown = buffer ?? value;
  const swatch = isHexColor(value) ? value : fallback;

  // Commit a validated hex and clear the local edit buffer.
  const apply = (hex: string) => {
    onChange(hex);
    setBuffer(null);
  };
  const commitText = () => {
    if (buffer === null) return;
    const hex = normalizeHex(buffer);
    if (hex) onChange(hex);
    setBuffer(null); // revert to `value` when malformed
  };

  return (
    <div className="py-3 border-b border-line last:border-0">
      <p className="text-[13px] font-medium text-ink">{label}</p>
      <p className="text-[12px] text-muted mt-0.5 mb-2 leading-relaxed">{description}</p>
      <div className="flex flex-wrap items-center gap-2">
        <label
          className="relative w-9 h-9 rounded-lg border border-line overflow-hidden cursor-pointer shrink-0"
          style={{ backgroundColor: swatch }}
          title="Open color picker"
        >
          <input
            type="color"
            value={swatch}
            onChange={(e) => apply(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer"
            aria-label={`${label} color picker`}
          />
        </label>
        <input
          type="text"
          value={shown}
          onChange={(e) => setBuffer(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitText();
          }}
          spellCheck={false}
          maxLength={7}
          aria-label={`${label} hex value`}
          className="w-24 px-2.5 py-1.5 rounded-lg border border-line text-[13px] font-mono uppercase outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:focus:ring-emerald-900/60"
        />
        <div className="flex items-center gap-1">
          {CHATBOT_COLORS.slice(0, 8).map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Set ${label} to ${c}`}
              onClick={() => apply(c)}
              className={`w-5 h-5 rounded-full transition hover:scale-110 ${
                swatch.toLowerCase() === c.toLowerCase() ? "ring-2 ring-slate-800 ring-offset-1" : ""
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => apply(fallback)}
          className="ml-auto text-[12px] font-medium text-muted hover:text-ink transition"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

/* ── Reset confirmation dialog ──────────────────────────────────────────── */

function ConfirmReset({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cancel reset"
        onClick={onCancel}
        className="absolute inset-0 bg-black/40"
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="reset-title"
        className="relative w-full max-w-sm rounded-2xl bg-surface p-5 shadow-xl"
      >
        <h4 id="reset-title" className="text-[16px] font-bold text-ink">
          Reset Appearance?
        </h4>
        <p className="mt-1.5 text-[13px] text-muted leading-relaxed">
          This will restore all appearance settings to their default values. Your account,
          notifications and chatbot features are not affected.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl border border-line text-[13px] font-semibold text-muted hover:bg-surface-muted transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 rounded-xl bg-red-600 text-[13px] font-semibold text-white hover:bg-red-700 transition"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main section ───────────────────────────────────────────────────────── */

export function AppearanceSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<AppearanceSettings>(APPEARANCE_DEFAULTS);
  const [draft, setDraft] = useState<AppearanceSettings>(APPEARANCE_DEFAULTS);
  const [status, setStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    fetchUserSettings()
      .then((s) => {
        const a = resolveAppearance(s.appearance);
        setSaved(a);
        setDraft(a);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(saved),
    [draft, saved]
  );

  const set = <K extends keyof AppearanceSettings>(key: K, value: AppearanceSettings[K]) =>
    setDraft((p) => ({ ...p, [key]: value }));

  const lc = layoutControls(draft.chatbot_open_style);

  const persist = useCallback(async (next: AppearanceSettings, successMsg: string) => {
    setSaving(true);
    setStatus(null);
    try {
      const res = await updateUserSettings({ appearance: next });
      const a = resolveAppearance(res.appearance);
      setSaved(a);
      setDraft(a);
      if (successMsg) setStatus({ type: "success", msg: successMsg });
    } catch (err) {
      setStatus({ type: "error", msg: getErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  }, []);

  /* Auto-save: `dirty` (draft ≠ last server-confirmed appearance) flips true
     on any control change, and a short debounce later the draft is PATCHed.
     Persisting re-syncs draft with the response, which clears `dirty`, so the
     echo never loops. */
  useEffect(() => {
    if (!dirty || loading || saving) return;
    const t = setTimeout(() => void persist(draft, ""), 800);
    return () => clearTimeout(t);
  }, [dirty, loading, saving, draft, persist]);

  const doReset = async () => {
    setConfirmReset(false);
    setDraft(APPEARANCE_DEFAULTS);
    await persist(APPEARANCE_DEFAULTS, "Appearance reset to defaults.");
  };

  if (loading) return <SkeletonRows count={6} />;

  return (
    <>
      {/* Container query (not viewport): the preview docks to the right whenever
          the settings CONTENT area is wide enough — independent of the modal's
          fixed 230px nav + padding — so it reliably appears beside the controls
          (spec §19). Below the threshold the columns stack and the preview moves
          to the bottom. `@container` sits on a wrapper so ConfirmReset's fixed
          overlay (rendered outside it) isn't captured by layout containment. */}
      <div className="@container">
        <div className="@min-[640px]:grid @min-[640px]:grid-cols-[minmax(0,1fr)_320px] @min-[640px]:items-start @min-[640px]:gap-6">
        <div className="min-w-0 space-y-6">
      {/* Colors */}
      <Group title="Colors" hint="Pick swatches, edit the HEX value, or reset any color to its default.">
        <div>
          {COLOR_FIELDS.map((f) => (
            <ColorControl
              key={f.key}
              label={f.label}
              description={f.description}
              value={draft[f.key] as string}
              fallback={APPEARANCE_DEFAULTS[f.key] as string}
              onChange={(hex) => set(f.key as keyof AppearanceSettings, hex as never)}
            />
          ))}
        </div>
      </Group>

      {/* Chatbot Layout */}
      <Group title="Chatbot Layout" hint="Where and how the assistant opens.">
        <div className="space-y-4">
          <RadioGroup
            legend="Open Style"
            name="appearance-open-style"
            options={OPEN_STYLE_OPTIONS}
            value={draft.chatbot_open_style}
            onChange={(v) => set("chatbot_open_style", v)}
            cols={4}
          />
          {lc.usesWidth && (
            <RadioGroup
              legend="Panel Width"
              name="appearance-panel-width"
              options={PANEL_WIDTH_OPTIONS}
              value={draft.panel_width}
              onChange={(v) => set("panel_width", v)}
            />
          )}
          {lc.usesHeight && (
            <RadioGroup
              legend="Panel Height"
              name="appearance-panel-height"
              options={PANEL_HEIGHT_OPTIONS}
              value={draft.panel_height}
              onChange={(v) => set("panel_height", v)}
            />
          )}
          {lc.usesRadius && (
            <RadioGroup
              legend="Border Radius"
              name="appearance-radius"
              options={BORDER_RADIUS_OPTIONS}
              value={draft.border_radius}
              onChange={(v) => set("border_radius", v)}
            />
          )}
          {lc.usesOverlay && (
            <RadioGroup
              legend="Overlay"
              name="appearance-overlay"
              options={OVERLAY_OPTIONS}
              value={draft.overlay}
              onChange={(v) => set("overlay", v)}
            />
          )}
        </div>
      </Group>

      {/* Chat Appearance */}
      <Group title="Chat Appearance" hint="How messages look inside the conversation.">
        <div className="space-y-4">
          <RadioGroup
            legend="Message Style"
            name="appearance-message-style"
            options={MESSAGE_STYLE_OPTIONS}
            value={draft.message_style}
            onChange={(v) => set("message_style", v)}
          />
          <RadioGroup
            legend="Chat Density"
            name="appearance-density"
            options={DENSITY_OPTIONS}
            value={draft.chat_density}
            onChange={(v) => set("chat_density", v)}
          />
          <RadioGroup
            legend="Font Size"
            name="appearance-font-size"
            options={FONT_SIZE_OPTIONS}
            value={draft.font_size}
            onChange={(v) => set("font_size", v)}
          />
          <RadioGroup
            legend="Message Bubble Width"
            name="appearance-bubble-width"
            options={BUBBLE_WIDTH_OPTIONS}
            value={draft.message_bubble_width}
            onChange={(v) => set("message_bubble_width", v)}
            cols={4}
          />
        </div>
      </Group>

      {/* Header */}
      <Group title="Header">
        <div className="space-y-3">
          <ToggleRow
            id="app-show-name"
            label="Show chatbot name"
            description="Display the assistant's name in the header."
            checked={draft.show_chatbot_name}
            onChange={(v) => set("show_chatbot_name", v)}
          />
          <ToggleRow
            id="app-show-icon"
            label="Show AI icon"
            description="Show the assistant icon in the header and beside replies."
            checked={draft.show_ai_icon}
            onChange={(v) => set("show_ai_icon", v)}
          />
          <ToggleRow
            id="app-compact-header"
            label="Compact header"
            description="Reduce the header height and padding."
            checked={draft.compact_header}
            onChange={(v) => set("compact_header", v)}
          />
          <div className="pt-1">
            <RadioGroup
              legend="Header Style"
              name="appearance-header-style"
              options={HEADER_STYLE_OPTIONS}
              value={draft.header_style}
              onChange={(v) => set("header_style", v)}
            />
          </div>
        </div>
      </Group>

      {/* Input Box */}
      <Group title="Input Box">
        <div className="space-y-3">
          <ToggleRow
            id="app-input-rounded"
            label="Rounded input"
            description="Use a fully rounded composer field."
            checked={draft.input_rounded}
            onChange={(v) => set("input_rounded", v)}
          />
          <ToggleRow
            id="app-input-border"
            label="Input border"
            description="Show a visible border around the composer field."
            checked={draft.input_border}
            onChange={(v) => set("input_border", v)}
          />
          <ToggleRow
            id="app-input-autogrow"
            label="Auto grow"
            description="Let the input expand as you type multiple lines."
            checked={draft.input_auto_grow}
            onChange={(v) => set("input_auto_grow", v)}
          />
          <div className="pt-1">
            <RadioGroup
              legend="Send Button Style"
              name="appearance-send-style"
              options={SEND_BUTTON_OPTIONS}
              value={draft.send_button_style}
              onChange={(v) => set("send_button_style", v)}
            />
          </div>
        </div>
      </Group>

      {/* Status + save row live inside the left column so the right-hand
          preview stays anchored while the user scrolls (see <aside> below). */}
      {status && <Banner type={status.type} message={status.msg} onDismiss={() => setStatus(null)} />}

      <div className="flex items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={() => setConfirmReset(true)}
          disabled={saving}
          className="text-[13px] font-semibold text-muted hover:text-red-600 transition disabled:opacity-50"
        >
          Reset appearance
        </button>
        <div className="flex-1 max-w-[240px]">
          <AutoSaveRow saving={saving} />
        </div>
      </div>
        </div>
        {/* /left column */}

        <aside className="mt-6 @min-[640px]:mt-0 @min-[640px]:sticky @min-[640px]:top-0 @min-[640px]:self-start">
          <Group
            title="Preview"
            hint="Updates instantly as you change settings — no need to save first."
          >
            <AssistantChatPreview appearance={draft} />
          </Group>
        </aside>
        </div>
        {/* /grid */}
      </div>
      {/* /@container */}

      {confirmReset && (
        <ConfirmReset onCancel={() => setConfirmReset(false)} onConfirm={() => void doReset()} />
      )}
    </>
  );
}
