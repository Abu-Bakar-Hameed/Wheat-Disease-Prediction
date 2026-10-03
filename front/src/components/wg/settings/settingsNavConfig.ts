import type { ComponentType } from "react";
import {
  Settings,
  Palette,
  ScanLine,
  CloudSun,
  CalendarDays,
  Bell,
  Bot,
  ShieldCheck,
  Lock,
  LifeBuoy,
} from "lucide-react";

export interface SettingsNavItem {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string; size?: number }>;
  Component: ComponentType;
  /**
   * When true, `SettingsModal` widens its panel so the section can use a
   * side-by-side layout — currently only Appearance, which keeps its live
   * preview docked to the right of the controls (spec §19).
   */
  wide?: boolean;
}

// Ten sections, in display order. Every section maps to a component that is
// either fully backed by a real endpoint or renders honest "coming soon" rows —
// nothing fakes a save. The Games section is intentionally absent (removed).
// Components are imported by reference; the reference resolves at render time,
// so there is no load-time circular dependency with SettingsModal.
import { GeneralSection } from "./GeneralSection";
import { AppearanceSection } from "./AppearanceSection";
import { PredictionSection } from "./PredictionSection";
import { WeatherSection } from "./WeatherSection";
import { CalendarSection } from "./CalendarSection";
import { NotificationsSection } from "./NotificationsSection";
import { ChatbotSection } from "./ChatbotSection";
import { PrivacySection } from "./PrivacySection";
import { SecuritySection } from "./SecuritySection";
import { SupportEmailSection } from "./SupportEmailSection";

export const SETTINGS_NAV: SettingsNavItem[] = [
  { id: "general", label: "General", icon: Settings, Component: GeneralSection },
  { id: "appearance", label: "Appearance", icon: Palette, Component: AppearanceSection, wide: true },
  { id: "prediction", label: "Prediction", icon: ScanLine, Component: PredictionSection },
  { id: "weather", label: "Weather & Risk", icon: CloudSun, Component: WeatherSection },
  { id: "calendar", label: "Calendar & Reminders", icon: CalendarDays, Component: CalendarSection },
  { id: "notifications", label: "Notifications", icon: Bell, Component: NotificationsSection },
  { id: "chatbot", label: "AI Chatbot", icon: Bot, Component: ChatbotSection },
  { id: "privacy", label: "Privacy & Data", icon: ShieldCheck, Component: PrivacySection },
  { id: "security", label: "Security & Account", icon: Lock, Component: SecuritySection },
  { id: "support", label: "Support", icon: LifeBuoy, Component: SupportEmailSection },
];
