"use client";

/**
 * SettingsLandingEffect — makes the "Default start page" and "Remember last page"
 * settings actually take effect on the dashboard, without touching the auth flow.
 *
 *  • On a one-time arrival at the bare `/dashboard` route, redirect to the user's
 *    chosen landing page (their last visited top-level route when "remember" is
 *    on, otherwise their configured default). Deep links are never overridden.
 *  • When "remember last page" is on, persist the current top-level dashboard
 *    route into `last_visited_page` — throttled to distinct changes so it isn't
 *    written on every keystroke/render.
 *
 * It renders nothing and owns no state beyond two refs.
 */

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUserSettings } from "@/lib/useUserSettings";
import { updateUserSettings } from "@/lib/api";
import { DASHBOARD_LANDING_ROUTES } from "@/lib/settingsFormat";

const VALID = new Set(DASHBOARD_LANDING_ROUTES.map((r) => r.path));

export function SettingsLandingEffect() {
  const router = useRouter();
  const pathname = usePathname();
  const { settings } = useUserSettings();

  const didLand = useRef(false);
  const lastWritten = useRef<string | null>(null);

  // ── One-time landing redirect ──────────────────────────────────────────────
  useEffect(() => {
    if (didLand.current) return;
    // Only ever act on the bare overview route; a direct link to a sub-page
    // (or the user having already navigated) means "don't fight the user".
    if (pathname !== "/dashboard") {
      didLand.current = true;
      return;
    }
    didLand.current = true;

    const remember = settings.remember_last_page === true;
    const last = settings.last_visited_page;
    const dflt = settings.default_start_page;

    let target: string | null = null;
    if (remember && last && VALID.has(last) && last !== "/dashboard") {
      target = last;
    } else if (dflt && VALID.has(dflt) && dflt !== "/dashboard") {
      target = dflt;
    }
    if (target) router.replace(target);
  }, [pathname, settings, router]);

  // ── Record the last top-level route when "remember" is enabled ──────────────
  useEffect(() => {
    if (settings.remember_last_page !== true) return;
    if (!VALID.has(pathname)) return;
    if (pathname === settings.last_visited_page) return;
    if (lastWritten.current === pathname) return;

    const t = setTimeout(() => {
      lastWritten.current = pathname;
      // PATCH merges scalar-only on the backend, so this can't wipe other
      // settings; failures are swallowed (best-effort convenience storage).
      updateUserSettings({ last_visited_page: pathname }).catch(() => {});
    }, 1200);
    return () => clearTimeout(t);
  }, [pathname, settings.remember_last_page, settings.last_visited_page]);

  return null;
}
