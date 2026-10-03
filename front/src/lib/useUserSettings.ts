"use client";

/**
 * Shared, live view of the authenticated user's settings.
 *
 * Returns the last-known settings synchronously (from the localStorage cache)
 * so surfaces like the assistant panel render the correct controls on first
 * paint, then keeps them fresh:
 *   • a `fetchUserSettings()` on mount reconciles with the server, and
 *   • the `USER_SETTINGS_EVENT` window event (dispatched by every save/fetch)
 *     updates already-mounted components immediately — no reload/rebuild.
 */

import { useEffect, useState } from "react";
import {
  USER_SETTINGS_EVENT,
  fetchUserSettings,
  getCachedUserSettings,
  type UserSettings,
} from "@/lib/api";

export function useUserSettings() {
  const [settings, setSettings] = useState<UserSettings>(() =>
    typeof window === "undefined" ? {} : getCachedUserSettings()
  );

  useEffect(() => {
    // Reconcile with the server once on mount (setState in the async
    // resolution callback, not synchronously in the effect body).
    let alive = true;
    fetchUserSettings()
      .then((next) => {
        if (alive) setSettings(next);
      })
      .catch(() => {
        /* keep the cached value */
      });

    // Keep already-mounted surfaces fresh when settings are saved elsewhere.
    const onUpdated = (event: Event) => {
      const detail = (event as CustomEvent<UserSettings>).detail;
      if (detail) setSettings(detail);
    };
    window.addEventListener(USER_SETTINGS_EVENT, onUpdated);

    return () => {
      alive = false;
      window.removeEventListener(USER_SETTINGS_EVENT, onUpdated);
    };
  }, []);

  return { settings } as const;
}
