"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/appState";
import { useAuth } from "@/lib/auth";
import { Icon } from "@/components/wg/ui";
import { cn } from "@/lib/utils";

export function Header() {
  const router = useRouter();
  const { setRole } = useApp();
  const { user, displayName, initials, affiliation, signOut } = useAuth();
  const [notifOpen, setNotifOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between gap-4 border-b border-line bg-surface/90 px-4 shadow-xs backdrop-blur sm:px-6">
        {/* Left: Brand */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-800 text-brand-100 shadow-sm">
              <Icon name="biotech" size={20} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold tracking-tight text-brand-900">WheatGuard AI</span>
              <span className="hidden rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-700 sm:inline-block">
                v2.4 Core
              </span>
            </div>
          </div>

          {/* Live status */}
          <div className="ml-2 hidden items-center gap-2 rounded-full border border-line bg-surface-muted px-3 py-1 text-[11px] lg:flex">
            <span className="h-2 w-2 animate-pulse rounded-full bg-brand-600" />
            <span className="font-medium text-muted">Vision AI v2.4 Online · 99.8% Uptime</span>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Notification bell */}
          <div className="relative">
            <button
              onClick={() => setNotifOpen((v) => !v)}
              aria-label="Notifications"
              className={cn(
                "relative rounded-lg p-2 text-muted transition-colors hover:bg-surface-muted hover:text-ink",
                notifOpen && "bg-surface-muted text-ink"
              )}
            >
              <Icon name="notifications" size={20} />
              <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-surface" />
            </button>
          </div>

          <div className="flex items-center gap-2.5 border-l border-line pl-2 sm:pl-3">
            {user ? (
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-800 text-[13px] font-bold text-white ring-2 ring-brand-200">
                  {initials}
                </div>
                <div className="hidden text-left xl:block">
                  <div className="text-[13px] font-semibold leading-tight text-ink">{displayName}</div>
                  <div className="text-[11px] leading-tight text-muted">{affiliation}</div>
                </div>
                <button
                  type="button"
                  title="Switch user or sign out"
                  aria-label="Sign out"
                  onClick={async () => {
                    await signOut();
                    setRole("guest");
                    window.location.href = "/";
                  }}
                  className="rounded-lg p-1.5 text-muted transition-colors hover:bg-danger-soft hover:text-danger"
                >
                  <Icon name="logout" size={18} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => router.push("/login?mode=user-login")}
                className="flex items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 py-2 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-brand-800"
              >
                <Icon name="login" size={17} />
                <span>Sign In</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Notification flyout */}
      {notifOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
          <div className="fixed right-4 top-16 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-surface shadow-lg animate-scale-in sm:right-6">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div className="flex items-center gap-2">
                <Icon name="notifications" size={18} className="text-brand-800" />
                <span className="text-[15px] font-semibold text-ink">Field Telemetry Alerts</span>
              </div>
              <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-semibold text-danger">3 New</span>
            </div>
            <div className="mt-1 max-h-72 divide-y divide-line/60 overflow-y-auto px-2 pb-1">
              {[
                { tone: "danger", dot: "bg-danger", title: "High Risk: Yellow Rust", time: "10m ago", body: "Sector 4-B humidity crossed 78%. Spore dispersion index elevated." },
                { tone: "brand", dot: "bg-brand-600", title: "Batch Scan Completed", time: "42m ago", body: "Field Block North: 64 leaves processed. 92% healthy wheat status." },
                { tone: "brand", dot: "bg-brand-600", title: "Model Inference Update", time: "2h ago", body: "WheatGuard-Vision-v2.4 weights redeployed. Accuracy: 96.8%." },
              ].map((n) => (
                <div key={n.title} className="cursor-pointer rounded-lg px-2 py-2.5 transition-colors hover:bg-surface-muted">
                  <div className="flex items-center justify-between">
                    <span className={cn("flex items-center gap-1.5 text-[11px] font-bold", n.tone === "danger" ? "text-danger" : "text-brand-700")}>
                      <span className={cn("h-2 w-2 rounded-full", n.dot)} />
                      {n.title}
                    </span>
                    <span className="text-[12px] text-muted">{n.time}</span>
                  </div>
                  <p className="mt-1 text-[12px] text-muted">{n.body}</p>
                </div>
              ))}
            </div>
            <div className="border-t border-line px-4 py-3 text-center">
              <button onClick={() => setNotifOpen(false)} className="text-[11px] font-semibold text-brand-700 hover:underline">
                Mark all as read
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
