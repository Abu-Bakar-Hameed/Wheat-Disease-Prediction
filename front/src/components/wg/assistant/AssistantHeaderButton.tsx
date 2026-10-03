"use client";

/**
 * The "+" entry point for the built-in AI assistant.
 *
 * Rendered in the user top bar (user-side only, never admin). Clicking it
 * opens the floating assistant panel via a window event — no per-bot lookup,
 * no API keys, no navigation. It is always available because the assistant is
 * built in.
 */

import { useAuth } from "@/lib/auth";
import { openAssistantLauncher } from "./assistantEvents";

export function AssistantHeaderButton() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <button
      type="button"
      onClick={openAssistantLauncher}
      className="w-10 h-10 rounded-xl text-ink hover:bg-[#F4F6F5] hover:text-brand-900 flex items-center justify-center transition-all duration-150"
      aria-label="Open AI Assistant"
      title="AI Assistant"
    >
      <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
        add
      </span>
    </button>
  );
}
