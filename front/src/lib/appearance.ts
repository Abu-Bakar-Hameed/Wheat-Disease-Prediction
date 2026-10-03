/**
 * Shared Appearance model + design-token helpers.
 *
 * This is the single source of truth for the Settings → Appearance feature.
 * The SAME resolvers are consumed by:
 *   • the real assistant (AssistantChatPanel / AssistantLauncher),
 *   • the live preview inside the Appearance settings, and
 *   • the global theme effect (UserThemeEffect).
 *
 * Keeping them together means the preview is the real chatbot's look, not a
 * hand-drawn imitation (spec §20), and colors/dimensions flow through CSS
 * variables and shared class maps rather than being hard-coded per component
 * (spec §33).
 */

import { isHexColor } from "./chatbotMeta";

/* ── Types ──────────────────────────────────────────────────────────────── */

export type ThemeChoice = "light" | "dark" | "system";
export type OpenStyle =
  | "right_sidebar"
  | "left_sidebar"
  | "center_modal"
  | "bottom_sheet"
  | "floating"
  | "split"
  | "fullscreen";
export type PanelWidth = "narrow" | "medium" | "wide" | "extra_wide";
export type PanelHeight = "compact" | "medium" | "tall" | "full";
export type BorderRadius = "none" | "small" | "medium" | "large" | "extra_large";
export type Overlay = "none" | "light" | "medium" | "strong";
export type MessageStyle = "rounded" | "soft" | "square";
export type ChatDensity = "compact" | "comfortable" | "spacious";
export type FontSize = "small" | "medium" | "large";
export type BubbleWidth = "narrow" | "medium" | "wide" | "full";
export type HeaderStyle = "minimal" | "standard" | "elevated";
export type SendButtonStyle = "icon" | "filled" | "outline" | "minimal";

export interface AppearanceSettings {
  theme: ThemeChoice;

  primary_color: string;
  accent_color: string;
  chatbot_color: string;
  user_message_color: string;
  ai_message_color: string;
  background_color: string;

  chatbot_open_style: OpenStyle;
  panel_width: PanelWidth;
  panel_height: PanelHeight;
  border_radius: BorderRadius;
  overlay: Overlay;

  message_style: MessageStyle;
  chat_density: ChatDensity;
  font_size: FontSize;
  message_bubble_width: BubbleWidth;

  show_chatbot_name: boolean;
  show_ai_icon: boolean;
  compact_header: boolean;
  header_style: HeaderStyle;

  input_rounded: boolean;
  input_border: boolean;
  input_auto_grow: boolean;
  send_button_style: SendButtonStyle;
}

/* ── Defaults (WheatGuard visual identity) ──────────────────────────────── */

export const APPEARANCE_DEFAULTS: AppearanceSettings = {
  theme: "system",

  primary_color: "#15803d",
  accent_color: "#15803d",
  chatbot_color: "#15803d",
  user_message_color: "#15803d",
  ai_message_color: "#ffffff",
  background_color: "#f8fafc",

  chatbot_open_style: "right_sidebar",
  panel_width: "medium",
  panel_height: "tall",
  border_radius: "large",
  overlay: "medium",

  message_style: "rounded",
  chat_density: "comfortable",
  font_size: "medium",
  message_bubble_width: "wide",

  show_chatbot_name: true,
  show_ai_icon: true,
  compact_header: false,
  header_style: "standard",

  input_rounded: true,
  input_border: true,
  input_auto_grow: true,
  send_button_style: "icon",
};

/** Merge a (possibly partial) stored object over the defaults, defensively. */
export function resolveAppearance(
  input?: Partial<AppearanceSettings> | null
): AppearanceSettings {
  if (!input || typeof input !== "object") return { ...APPEARANCE_DEFAULTS };
  const merged = { ...APPEARANCE_DEFAULTS, ...input };
  // Sanitize every color so malformed values never reach the DOM as CSS.
  const colorKeys = [
    "primary_color",
    "accent_color",
    "chatbot_color",
    "user_message_color",
    "ai_message_color",
    "background_color",
  ] as const;
  for (const key of colorKeys) {
    if (!isHexColor(merged[key])) merged[key] = APPEARANCE_DEFAULTS[key];
  }
  return merged;
}

/* ── Option metadata (drive the settings UI) ────────────────────────────── */

export interface Option<T extends string> {
  value: T;
  label: string;
  icon: string;
  description?: string;
}

export const THEME_OPTIONS: Option<ThemeChoice>[] = [
  { value: "light", label: "Light", icon: "light_mode" },
  { value: "dark", label: "Dark", icon: "dark_mode" },
  { value: "system", label: "System", icon: "brightness_auto" },
];

export const OPEN_STYLE_OPTIONS: Option<OpenStyle>[] = [
  { value: "right_sidebar", label: "Right Sidebar", icon: "dock_to_right" },
  { value: "left_sidebar", label: "Left Sidebar", icon: "dock_to_left" },
  { value: "center_modal", label: "Center Modal", icon: "aspect_ratio" },
  { value: "bottom_sheet", label: "Bottom Sheet", icon: "vertical_align_bottom" },
  { value: "floating", label: "Floating Window", icon: "picture_in_picture_alt" },
  { value: "split", label: "Split View", icon: "vertical_split" },
  { value: "fullscreen", label: "Full Screen", icon: "fullscreen" },
];

export const PANEL_WIDTH_OPTIONS: Option<PanelWidth>[] = [
  { value: "narrow", label: "Narrow", icon: "arrow_range" },
  { value: "medium", label: "Medium", icon: "drag_handle" },
  { value: "wide", label: "Wide", icon: "width_wide" },
  { value: "extra_wide", label: "Extra Wide", icon: "width_full" },
];

export const PANEL_HEIGHT_OPTIONS: Option<PanelHeight>[] = [
  { value: "compact", label: "Compact", icon: "expand_less" },
  { value: "medium", label: "Medium", icon: "height" },
  { value: "tall", label: "Tall", icon: "expand_more" },
  { value: "full", label: "Full Height", icon: "fullscreen" },
];

export const BORDER_RADIUS_OPTIONS: Option<BorderRadius>[] = [
  { value: "none", label: "None", icon: "crop_square" },
  { value: "small", label: "Small", icon: "rounded_corner" },
  { value: "medium", label: "Medium", icon: "rounded_corner" },
  { value: "large", label: "Large", icon: "all_inclusive" },
  { value: "extra_large", label: "Extra Large", icon: "all_inclusive" },
];

export const OVERLAY_OPTIONS: Option<Overlay>[] = [
  { value: "none", label: "None", icon: "hide_image" },
  { value: "light", label: "Light", icon: "contrast" },
  { value: "medium", label: "Medium", icon: "contrast" },
  { value: "strong", label: "Strong", icon: "contrast" },
];

export const MESSAGE_STYLE_OPTIONS: Option<MessageStyle>[] = [
  { value: "rounded", label: "Rounded", icon: "rounded_corner" },
  { value: "soft", label: "Soft", icon: "contrast" },
  { value: "square", label: "Square", icon: "crop_square" },
];

export const DENSITY_OPTIONS: Option<ChatDensity>[] = [
  { value: "compact", label: "Compact", icon: "compress" },
  { value: "comfortable", label: "Comfortable", icon: "drag_handle" },
  { value: "spacious", label: "Spacious", icon: "space_bar" },
];

export const FONT_SIZE_OPTIONS: Option<FontSize>[] = [
  { value: "small", label: "Small", icon: "text_decrease" },
  { value: "medium", label: "Medium", icon: "text_fields" },
  { value: "large", label: "Large", icon: "text_increase" },
];

export const BUBBLE_WIDTH_OPTIONS: Option<BubbleWidth>[] = [
  { value: "narrow", label: "Narrow", icon: "expand_less" },
  { value: "medium", label: "Medium", icon: "drag_handle" },
  { value: "wide", label: "Wide", icon: "width_wide" },
  { value: "full", label: "Full", icon: "width_full" },
];

export const HEADER_STYLE_OPTIONS: Option<HeaderStyle>[] = [
  { value: "minimal", label: "Minimal", icon: "remove" },
  { value: "standard", label: "Standard", icon: "horizontal_rule" },
  { value: "elevated", label: "Elevated", icon: "elevation" },
];

export const SEND_BUTTON_OPTIONS: Option<SendButtonStyle>[] = [
  { value: "icon", label: "Icon", icon: "send" },
  { value: "filled", label: "Filled", icon: "send" },
  { value: "outline", label: "Outline", icon: "send" },
  { value: "minimal", label: "Minimal", icon: "send" },
];

export interface ColorField {
  key: keyof AppearanceSettings;
  label: string;
  description: string;
}

export const COLOR_FIELDS: ColorField[] = [
  { key: "primary_color", label: "Primary Color", description: "Buttons, active navigation and key controls across your dashboard." },
  { key: "accent_color", label: "Accent Color", description: "Secondary highlights and interactive elements." },
  { key: "chatbot_color", label: "Chatbot Color", description: "Assistant header, launcher and active states." },
  { key: "user_message_color", label: "User Message Color", description: "Background of your own chat messages." },
  { key: "ai_message_color", label: "AI Message Color", description: "Background of the assistant's replies." },
  { key: "background_color", label: "Background Color", description: "Chat surface behind the messages." },
];

/* ── Metric maps ────────────────────────────────────────────────────────── */

export const PANEL_WIDTH_PX: Record<PanelWidth, number> = {
  narrow: 320,
  medium: 400,
  wide: 480,
  extra_wide: 560,
};

export const PANEL_HEIGHT_PX: Record<PanelHeight, number> = {
  compact: 420,
  medium: 520,
  tall: 620,
  full: 0, // handled as 100vh by the launcher
};

export const RADIUS_PX: Record<BorderRadius, number> = {
  none: 0,
  small: 8,
  medium: 12,
  large: 16,
  extra_large: 24,
};

export const OVERLAY_CLASS: Record<Overlay, string> = {
  none: "bg-transparent",
  light: "bg-black/10",
  medium: "bg-black/30",
  strong: "bg-black/50",
};

export const FONT_SIZE_PX: Record<FontSize, number> = {
  small: 12.5,
  medium: 14,
  large: 16,
};

export interface DensityMetrics {
  /** vertical gap between bubbles */
  list: string;
  /** bubble inner padding */
  pad: string;
  /** gap between avatar and bubble */
  gap: string;
}

export const DENSITY_METRICS: Record<ChatDensity, DensityMetrics> = {
  compact: { list: "space-y-1.5", pad: "px-3 py-1.5", gap: "gap-1.5" },
  comfortable: { list: "space-y-3", pad: "px-3.5 py-2", gap: "gap-2" },
  spacious: { list: "space-y-4", pad: "px-4 py-3", gap: "gap-2.5" },
};

export const BUBBLE_RADIUS_CLASS: Record<MessageStyle, string> = {
  rounded: "rounded-3xl",
  soft: "rounded-xl",
  square: "rounded-md",
};

export const BUBBLE_MAXW_CLASS: Record<BubbleWidth, string> = {
  narrow: "max-w-[55%]",
  medium: "max-w-[68%]",
  wide: "max-w-[82%]",
  full: "max-w-full",
};

/* ── Which layout controls apply to a given open style (spec §9/§10/§12) ─── */

export interface LayoutControlFlags {
  usesWidth: boolean;
  usesHeight: boolean;
  usesOverlay: boolean;
  usesRadius: boolean;
}

export function layoutControls(style: OpenStyle): LayoutControlFlags {
  switch (style) {
    case "fullscreen":
      return { usesWidth: false, usesHeight: false, usesOverlay: false, usesRadius: false };
    case "split":
      // Split keeps the app beside the chat; a docked column is full height
      // and must not dim the content behind it.
      return { usesWidth: true, usesHeight: false, usesOverlay: false, usesRadius: true };
    case "bottom_sheet":
      // Sheets are height-oriented and span the width of the viewport.
      return { usesWidth: false, usesHeight: true, usesOverlay: true, usesRadius: true };
    case "right_sidebar":
    case "left_sidebar":
      // Docked columns fill the viewport height; width is the meaningful axis.
      return { usesWidth: true, usesHeight: false, usesOverlay: true, usesRadius: true };
    case "center_modal":
    case "floating":
      return { usesWidth: true, usesHeight: true, usesOverlay: true, usesRadius: true };
    default:
      return { usesWidth: true, usesHeight: true, usesOverlay: true, usesRadius: true };
  }
}

/* ── Color helpers ──────────────────────────────────────────────────────── */

export function hexToRgb(hex: string): string {
  const safe = isHexColor(hex) ? hex : APPEARANCE_DEFAULTS.primary_color;
  const n = parseInt(safe.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

/** Pick readable text (white/near-black) for a solid background color. */
export function readableTextOn(hex: string): string {
  if (!isHexColor(hex)) return "#ffffff";
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  // Perceived luminance (ITU-R BT.601 weighting).
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma > 0.62 ? "#0f172a" : "#ffffff";
}

/** WCAG-ish relative luminance (0..1) of a hex color; 0 for invalid input. */
function wcagLuma(hex: string): number {
  if (!isHexColor(hex)) return 0;
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Linear blend of two hex colors (t = weight of `to`). */
function mixHex(from: string, to: string, t: number): string {
  const a = parseInt(from.slice(1), 16);
  const b = parseInt(to.slice(1), 16);
  const ch = (x: number, y: number) => Math.round(x + (y - x) * t);
  const r = ch((a >> 16) & 255, (b >> 16) & 255);
  const g = ch((a >> 8) & 255, (b >> 8) & 255);
  const bl = ch(a & 255, b & 255);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, "0")}`;
}

/**
 * Guaranteed-readable foreground for any background: keeps the brand-ish look
 * of `hint` when it already contrasts, otherwise blends it toward white or ink
 * until the luminance gap is comfortable. Unlike `readableTextOn` (a hard
 * white/ink flip), this never returns a color close to the background — which
 * is what made header text vanish on dark-accent chat themes.
 */
export function ensureContrast(bg: string, hint = "#ffffff"): string {
  if (!isHexColor(bg)) return "#ffffff";
  const lb = wcagLuma(bg);
  const target = 0.4; // minimum luma gap for body-size text
  let fg = isHexColor(hint) ? hint : "#ffffff";
  for (let i = 0; i < 10; i++) {
    if (Math.abs(wcagLuma(fg) - lb) >= target) return fg;
    // Blend toward whichever end is farther from the background.
    const toward = lb < 0.5 ? "#ffffff" : "#0f172a";
    fg = mixHex(fg, toward, 0.35);
  }
  return fg;
}

/**
 * Darken a hex color until it reads on a white chip. Suggestion pills render
 * accent-colored text on `#ffffff` regardless of the chat theme, so a light
 * accent (violet on white) would otherwise wash out.
 */
export function ensureContrastOnWhite(hex: string): string {
  if (!isHexColor(hex)) return hex;
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  // Iteratively scale down until luminance is dark enough for text on white.
  for (let i = 0; i < 8; i++) {
    const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (luma <= 0.35) break;
    r = Math.round(r * 0.8);
    g = Math.round(g * 0.8);
    b = Math.round(b * 0.8);
  }
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** Global CSS variables written to <html> so accent-aware components update. */
export function appearanceToCssVars(a: AppearanceSettings): Record<string, string> {
  return {
    "--wg-accent": a.primary_color,
    "--wg-accent-rgb": hexToRgb(a.primary_color),
    "--wg-secondary": a.accent_color,
    "--wg-chatbot": a.chatbot_color,
    "--wg-chatbot-rgb": hexToRgb(a.chatbot_color),
    "--wg-user-message": a.user_message_color,
    "--wg-ai-message": a.ai_message_color,
    "--wg-chat-background": a.background_color,
    "--wg-chat-radius": `${RADIUS_PX[a.border_radius]}px`,
    "--wg-chat-font-size": `${FONT_SIZE_PX[a.font_size]}px`,
  };
}
