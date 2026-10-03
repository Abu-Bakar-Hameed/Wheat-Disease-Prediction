"use client";

/**
 * Chatbot settings — the assistant feature toggles plus real model / key
 * controls (spec §10).
 *
 * Voice, Picture Upload, Recent Predictions and Notifications each map to a
 * real behaviour in the assistant (and, where relevant, are enforced again on
 * the server). Saving broadcasts a USER_SETTINGS_EVENT so an already-open
 * assistant panel updates without a reload (spec §26/§27).
 *
 * "Model & data" is now fully wired:
 * * Bring-your-own OpenRouter key — stored server-side (write-only; the GET
 *   only ever returns a masked "configured" flag) and used by /assistant/chat
 *   for this account instead of the shared server key.
 * * Model selection — the chosen free-tier model is passed to OpenRouter.
 * * Delete chat history — conversation history is held on-device, so this
 *   clears the local keys immediately (and honestly says so).
 */

import { useCallback, useEffect, useState } from "react";
import {
  fetchUserSettings,
  updateUserSettings,
  type UserSettings,
} from "@/lib/api";
import { AutoSaveRow, Banner, SectionIntro, SelectRow, SkeletonRows, ToggleRow, getErrorMessage } from "./shared";

const MODEL_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Server default" },
  { value: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B (free)" },
  { value: "google/gemini-2.0-flash-exp:free", label: "Gemini 2.0 Flash (free)" },
  { value: "deepseek/deepseek-chat-v3-0324:free", label: "DeepSeek V3 (free)" },
  { value: "qwen/qwen-2.5-72b-instruct:free", label: "Qwen 2.5 72B (free)" },
];

// Client-side chat stores cleared by "Delete chat history".
const CHAT_HISTORY_KEYS = [
  "wheatguard_chat_history_v3",
  "wheatguard_prediction_history_v1",
  "wheatguard_pending_chat",
];

export function ChatbotSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [settings, setSettings] = useState<UserSettings>({
    voice_enabled: true,
    image_upload_enabled: true,
    recent_predictions_enabled: true,
    chat_notifications_enabled: true,
  });
  const [status, setStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  // Key is handled separately: it's write-only, and we only send it when the
  // user actually edits the field (so an unrelated save never clears it).
  const [keyInput, setKeyInput] = useState("");
  const [keyDirty, setKeyDirty] = useState(false);

  useEffect(() => {
    fetchUserSettings()
      .then((s) => setSettings(s))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const setFlag = (key: keyof UserSettings, value: boolean) => {
    setDirty(true);
    setSettings((p) => ({ ...p, [key]: value }));
  };

  const handleSave = useCallback(async () => {
    setSaving(true);
    setStatus(null);
    try {
      const payload: UserSettings = { ...settings };
      if (keyDirty) payload.openrouter_api_key = keyInput.trim();
      const saved = await updateUserSettings(payload);
      setSettings(saved);
      setKeyInput("");
      setKeyDirty(false);
      setDirty(false);
      setStatus({ type: "success", msg: "Chatbot settings saved." });
    } catch (err) {
      setStatus({ type: "error", msg: getErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  }, [settings, keyDirty, keyInput]);

  /* Auto-save after any edit (toggles, model, or a pasted key). The key field
     gets a slightly longer grace period so a mid-paste pause never persists a
     truncated key on its own. */
  useEffect(() => {
    if (!dirty || loading || saving) return;
    const t = setTimeout(() => void handleSave(), keyDirty ? 1500 : 800);
    return () => clearTimeout(t);
  }, [dirty, loading, saving, keyDirty, handleSave]);

  const clearChatHistory = () => {
    try {
      CHAT_HISTORY_KEYS.forEach((k) => localStorage.removeItem(k));
      window.dispatchEvent(new CustomEvent("wg:chat-history-cleared"));
      setStatus({ type: "success", msg: "Chat history cleared on this device." });
    } catch (err) {
      setStatus({ type: "error", msg: getErrorMessage(err) });
    }
  };

  if (loading) return <SkeletonRows count={5} />;

  const configured = settings.openrouter_key_configured === true;

  return (
    <div className="space-y-1">
      <SectionIntro
        title="Assistant features"
        description="Turn the assistant's capabilities on or off. These are enforced both here and on the server."
      />

      <ToggleRow
        id="cb-voice"
        label="Voice input"
        description="Show the microphone button so you can dictate messages to the assistant."
        checked={settings.voice_enabled !== false}
        onChange={(v) => setFlag("voice_enabled", v)}
      />
      <ToggleRow
        id="cb-image"
        label="Picture upload"
        description="Allow attaching a leaf or crop photo from inside the assistant chat."
        checked={settings.image_upload_enabled !== false}
        onChange={(v) => setFlag("image_upload_enabled", v)}
      />
      <ToggleRow
        id="cb-recent"
        label="Recent predictions"
        description="Let the assistant see your latest scan so it can answer about your most recent diagnosis."
        checked={settings.recent_predictions_enabled !== false}
        onChange={(v) => setFlag("recent_predictions_enabled", v)}
      />
      <ToggleRow
        id="cb-notify"
        label="Notifications"
        description="Receive in-app notifications related to the assistant."
        checked={settings.chat_notifications_enabled !== false}
        onChange={(v) => setFlag("chat_notifications_enabled", v)}
      />

      <SectionIntro
        title="Model & data"
        description="Bring your own OpenRouter key and pick the model that answers you. Leave the key empty to use WheatGuard's shared model. The look of the chat is customised under Appearance."
      />

      {/* OpenRouter API key (write-only; only a "configured" flag comes back) */}
      <div className="py-3.5 border-b border-line">
        <label htmlFor="cb-key" className="text-[14px] font-medium text-ink">
          OpenRouter API key
        </label>
        <p className="text-[12px] text-muted mt-0.5 mb-2 leading-relaxed">
          {configured
            ? "A key is saved for your account. Type a new one to replace it, or clear the field and save to remove it."
            : "Optional. Paste an sk-or-… key to run the assistant on your own OpenRouter billing."}
        </p>
        <div className="flex items-center gap-2">
          <input
            id="cb-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={keyInput}
            onChange={(e) => {
              setKeyInput(e.target.value);
              setKeyDirty(true);
              setDirty(true);
            }}
            placeholder={configured ? "•••••••••••• (configured)" : "sk-or-v1-…"}
            className="flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-[13px] text-ink outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:focus:ring-emerald-900/60 transition"
          />
          {configured && (
            <span className="shrink-0 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700 uppercase dark:border-emerald-800/60 dark:bg-emerald-900/30 dark:text-emerald-300">
              On
            </span>
          )}
        </div>
      </div>

      <SelectRow
        id="cb-model"
        label="Model"
        description="Which AI model answers you when using the assistant."
        value={settings.chat_model ?? ""}
        options={MODEL_OPTIONS}
        onChange={(v) => {
          setDirty(true);
          setSettings((p) => ({ ...p, chat_model: v }));
        }}
      />

      {/* Delete chat history (client-side stores) */}
      <div className="flex items-start justify-between gap-4 py-3.5 border-b border-line">
        <div className="min-w-0">
          <span className="text-[14px] font-medium text-ink">Delete chat history</span>
          <p className="text-[12px] text-muted mt-0.5 leading-relaxed">
            Erase your saved assistant conversations on this device right away.
          </p>
        </div>
        <button
          type="button"
          onClick={clearChatHistory}
          className="shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-[13px] font-semibold text-red-600 transition hover:bg-red-100 dark:border-red-800/50 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/70"
        >
          Clear now
        </button>
      </div>

      {status && (
        <div className="pt-3">
          <Banner type={status.type} message={status.msg} onDismiss={() => setStatus(null)} />
        </div>
      )}

      <AutoSaveRow saving={saving} />
    </div>
  );
}
