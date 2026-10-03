"use client";

import { useState, type ReactNode } from "react";
import { UserSidebar } from "@/components/wg/UserSidebar";
import { UserTopBar } from "@/components/wg/UserTopBar";
import { AssistantLauncher } from "@/components/wg/assistant/AssistantLauncher";
import { FeedbackPromptGate } from "@/components/wg/feedback/FeedbackPromptGate";
import { UserThemeEffect } from "@/components/wg/assistant/UserThemeEffect";
import { SettingsLandingEffect } from "@/components/wg/SettingsLandingEffect";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex h-full min-h-screen overflow-hidden bg-canvas">
      <UserSidebar open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-canvas">
        <UserTopBar onMenuClick={() => setMobileNavOpen(true)} />
        <div className="flex-1 overflow-y-auto">{children}</div>
      </section>
      {/* Applies the user's saved theme + accent color as CSS variables. */}
      <UserThemeEffect />
      {/* Honours the default-start-page / remember-last-page settings. */}
      <SettingsLandingEffect />
      {/* Built-in AI assistant launcher — user dashboard only (never admin). */}
      <AssistantLauncher />
      {/* Automatic feedback popup surfaced once per session after a login. */}
      <FeedbackPromptGate />
    </div>
  );
}
