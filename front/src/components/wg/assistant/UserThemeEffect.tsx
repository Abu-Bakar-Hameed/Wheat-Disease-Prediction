"use client";

/**
 * Applies the user's saved Appearance settings to the dashboard shell.
 *
 * Renders nothing — it only writes to `document.documentElement`:
 *   • `data-theme` + the `dark` class reflect the light/dark/system choice
 *     (system is resolved live via `prefers-color-scheme`), and
 *   • the `--wg-*` CSS variables carry the chosen colors, radius and chat font
 *     size so any accent/token-aware surface updates instantly (spec §33).
 *
 * Scope note (spec §36): this persists and applies the theme/tokens to the
 * assistant surfaces and any `dark:`-aware or accent-variable-aware containers.
 * A full global dark-mode restyle of every legacy page is intentionally not
 * undertaken here to avoid destabilising the existing design system.
 */

import { useEffect } from "react";
import { useUserSettings } from "@/lib/useUserSettings";
import { appearanceToCssVars, resolveAppearance } from "@/lib/appearance";

export function UserThemeEffect() {
  const { settings } = useUserSettings();
  const a = resolveAppearance(settings.appearance);
  const theme = a.theme;

  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const wantsDark =
        theme === "dark" ||
        (theme === "system" &&
          typeof window !== "undefined" &&
          window.matchMedia("(prefers-color-scheme: dark)").matches);
      root.dataset.theme = wantsDark ? "dark" : "light";
      root.classList.toggle("dark", wantsDark);
    };
    apply();

    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    const vars = appearanceToCssVars(a);
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
    }
  }, [a]);

  return null;
}
