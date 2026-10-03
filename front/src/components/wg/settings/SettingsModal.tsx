"use client";

/**
 * SettingsModal — ChatGPT-style settings panel.
 *
 * Layout:
 *   md+  (two-column, unchanged):
 *   ┌──────────────────────────────────────────────┐
 *   │ ✕  │ [search]                                │
 *   │    │─────────────────────────────────────────│
 *   │nav │  <Heading>                              │
 *   │list│  <Section component>                    │
 *   └──────────────────────────────────────────────┘
 *
 *   mobile (drill-down): the nav list fills the sheet; tapping a row slides
 *   in the section with a ← back button in its sticky header. ✕ lives in a
 *   small top row above the search field (the old absolute ✕ would collide
 *   with the full-width search on narrow screens).
 *
 * Props:
 *   isOpen  — controls visibility
 *   onClose — called on ✕ / backdrop / Escape
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { Search, ChevronUp, ChevronDown } from "lucide-react";
import { SETTINGS_NAV } from "./settingsNavConfig";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [selectedId, setSelectedId] = useState(SETTINGS_NAV[0].id);
  const [query, setQuery] = useState("");
  /* Mobile drill-down pane: "list" shows the nav, "detail" shows the section.
   * Ignored at md+ where both columns are visible side by side. */
  const [pane, setPane] = useState<"list" | "detail">("list");

  // Scroll-shadow hints state
  const navScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  /* Reset to first item + clear search on every open. This uses React's
   * "adjust state during render" pattern (prev-value guard + setState in the
   * render body) instead of an effect — effects here would cascade renders,
   * and the modal returns null while closed so nothing else paints. */
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setSelectedId(SETTINGS_NAV[0].id);
      setQuery("");
      setPane("list");
    }
  }

  // Body scroll lock
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  // Update scroll-shadow hints when list scrolls
  const updateScrollHints = useCallback(() => {
    const el = navScrollRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 4);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  }, []);

  useEffect(() => {
    const el = navScrollRef.current;
    if (!el) return;
    // Initial check after render
    updateScrollHints();
    el.addEventListener("scroll", updateScrollHints, { passive: true });
    return () => el.removeEventListener("scroll", updateScrollHints);
  }, [isOpen, updateScrollHints]);

  // Re-check hints when filtered list changes height
  const filteredNav = SETTINGS_NAV.filter((item) =>
    item.label.toLowerCase().includes(query.toLowerCase().trim())
  );

  useEffect(() => {
    updateScrollHints();
  }, [filteredNav.length, updateScrollHints]);

  // Arrow-key nav inside the list
  const handleNavKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    currentIndex: number
  ) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = filteredNav[currentIndex + 1];
      if (next) setSelectedId(next.id);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = filteredNav[currentIndex - 1];
      if (prev) setSelectedId(prev.id);
    }
  };

  if (!isOpen) return null;

  // Resolve the active component — fall back to first if the selected id
  // was filtered out
  const activeItem =
    SETTINGS_NAV.find((n) => n.id === selectedId) ?? SETTINGS_NAV[0];
  const ActiveComponent = activeItem.Component;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center p-0 md:items-center md:justify-center md:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] md:bg-transparent md:backdrop-blur-none"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className={`relative z-10 flex h-full w-full overflow-hidden bg-surface shadow-2xl border border-line transition-[max-width] duration-200 md:h-[600px] md:rounded-2xl ${
          activeItem.wide ? "md:max-w-[1180px]" : "md:max-w-[850px]"
        }`}
      >
        {/* ── Close button (desktop: absolute over the nav column) ── */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close settings"
          className="absolute left-4 top-4 z-20 hidden h-7 w-7 items-center justify-center rounded-lg text-muted transition hover:bg-surface-muted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 md:flex"
        >
          <span className="text-[16px] leading-none select-none">✕</span>
        </button>

        {/* ════════════════════════════════════════
            LEFT NAV  (md+: fixed 230px column · mobile: full-width list)
        ════════════════════════════════════════ */}
        <div
          className={`w-full shrink-0 flex-col border-line bg-surface pt-4 md:flex md:w-[230px] md:border-r md:pt-14 ${
            pane === "list" ? "flex" : "hidden"
          }`}
        >
          {/* Mobile ✕ row (replaces the absolute desktop close button) */}
          <div className="flex items-center px-3 pb-1 md:hidden">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close settings"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-surface-muted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <span className="text-[16px] leading-none select-none">✕</span>
            </button>
          </div>

          {/* Search */}
          <div className="px-3 pb-2 pt-2 md:pt-0">
            <div className="flex items-center gap-2 rounded-full bg-surface-muted px-3 py-2">
              <Search
                size={14}
                className="shrink-0 text-muted"
                aria-hidden="true"
              />
              <input
                type="search"
                placeholder="Search settings"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full appearance-none bg-transparent text-[13px] text-ink placeholder:text-muted outline-none focus:outline-none focus:ring-0 [&::-webkit-search-cancel-button]:hidden"
                aria-label="Search settings"
              />
            </div>
          </div>

          {/* Scroll-up hint */}
          {canScrollUp && (
            <div className="flex justify-center py-0.5 text-muted/60 pointer-events-none select-none">
              <ChevronUp size={14} />
            </div>
          )}

          {/* Nav list */}
          <div
            ref={navScrollRef}
            className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5"
            role="listbox"
            aria-label="Settings categories"
          >
            {filteredNav.length === 0 ? (
              <p className="px-3 py-6 text-center text-[13px] text-muted">
                No settings found
              </p>
            ) : (
              filteredNav.map((item, idx) => {
                const Icon = item.icon;
                const isActive = item.id === selectedId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onClick={() => {
                      setSelectedId(item.id);
                      // Mobile: drill into the section; md+ keeps both columns
                      setPane("detail");
                    }}
                    onKeyDown={(e) => handleNavKeyDown(e, idx)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                      isActive
                        ? "bg-surface-muted text-ink"
                        : "text-muted hover:bg-surface-muted hover:text-ink"
                    }`}
                  >
                    <Icon
                      size={16}
                      className={
                        isActive ? "text-emerald-600 dark:text-emerald-400" : "text-muted"
                      }
                      aria-hidden="true"
                    />
                    {item.label}
                  </button>
                );
              })
            )}
          </div>

          {/* Scroll-down hint */}
          {canScrollDown && (
            <div className="flex justify-center py-0.5 text-muted/60 pointer-events-none select-none">
              <ChevronDown size={14} />
            </div>
          )}
        </div>

        {/* ════════════════════════════════════════
            RIGHT PANEL  (mobile: only shown in the detail pane)
        ════════════════════════════════════════ */}
        <div
          className={`min-w-0 flex-1 flex-col overflow-hidden bg-surface ${
            pane === "detail" ? "flex" : "hidden md:flex"
          }`}
        >
          {/* Panel heading — sticky (← back button is mobile-only) */}
          <div className="shrink-0 border-b border-line px-4 pt-5 pb-3 md:px-8 md:pt-6 md:pb-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPane("list")}
                aria-label="Back to settings list"
                className="-ml-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-surface-muted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 md:hidden"
              >
                <span className="text-[18px] leading-none select-none">←</span>
              </button>
              <h2 className="truncate text-[17px] font-bold text-ink md:text-[18px]">
                {activeItem.label}
              </h2>
            </div>
          </div>

          {/* Scrollable content area */}
          <div className="flex-1 overflow-y-auto px-4 py-5 md:px-8 md:py-6">
            <ActiveComponent />
          </div>
        </div>
      </div>
    </div>
  );
}
