/**
 * Small, dependency-free helpers shared by the built-in AI assistant and the
 * Appearance/Chatbot settings sections.
 *
 * The former multi-bot Chatbot metadata (providers, templates, sizes, bubble
 * styles, connection status, launcher events) was retired along with that
 * subsystem — only the generic color utilities and the assistant accent-color
 * presets remain here.
 */

/* ── Accent color presets ───────────────────────────────────────────────── */

export const CHATBOT_COLORS = [
  "#15803d",
  "#16a34a",
  "#059669",
  "#0d9488",
  "#0369a1",
  "#2563eb",
  "#7c3aed",
  "#c026d3",
  "#dc2626",
  "#ea580c",
  "#b45309",
  "#475569",
];

/* ── Color utilities ────────────────────────────────────────────────────── */

/** True for a plain #RRGGBB color (same rule the backend enforces). */
export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

/** Accepts "16a34a" or "#16A34A" → "#16a34a"; null when invalid. */
export function normalizeHex(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  const withHash = text.startsWith("#") ? text : `#${text}`;
  return isHexColor(withHash) ? withHash.toLowerCase() : null;
}

/** Friendly display name for a provider id (kept for report/diagnosis labels). */
export function providerLabel(id: string): string {
  const map: Record<string, string> = {
    openai: "OpenAI",
    gemini: "Google Gemini",
    anthropic: "Anthropic Claude",
    openrouter: "OpenRouter",
    custom: "Custom (OpenAI-compatible)",
  };
  return map[id] ?? id;
}
