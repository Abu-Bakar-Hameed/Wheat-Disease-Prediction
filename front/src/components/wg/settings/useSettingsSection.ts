"use client";

/**
 * useSettingsSection — the shared fetch → edit → AUTO-SAVE loop every settings
 * section uses, so no section re-implements loading/saving/error handling. It
 * talks only to the single `/api/v1/users/me/settings` endpoint (server
 * partial-merges the payload, deep-merging every nested preference group), so
 * two sections can never clobber each other's fields.
 *
 * There is no Save button: any edit made through `patch`/`patchGroup` marks the
 * form dirty and a short debounce later the whole current settings object is
 * PATCHed automatically. The server response replaces local state, so the two
 * stay in sync and the echo never triggers another save.
 */

import { useCallback, useEffect, useState } from "react";
import {
  fetchUserSettings,
  updateUserSettings,
  type UserSettings,
} from "@/lib/api";

export type SectionStatus = { type: "success" | "error"; msg: string } | null;

/** How long to wait after the last edit before auto-persisting. */
const AUTOSAVE_DEBOUNCE_MS = 800;

export function useSettingsSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [settings, setSettings] = useState<UserSettings>({});
  const [status, setStatus] = useState<SectionStatus>(null);

  useEffect(() => {
    let alive = true;
    fetchUserSettings()
      .then((s) => {
        if (alive) setSettings(s);
      })
      .catch(() => {
        /* keep defaults silently */
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  /** Shallow-patch a top-level setting (units, email_*, voice_enabled, …). */
  const patch = useCallback(
    (p: Partial<UserSettings>) => {
      setDirty(true);
      setSettings((s) => ({ ...s, ...p }));
    },
    []
  );

  /** Merge a partial update into one nested JSONB preference group. */
  const patchGroup = useCallback(
    <K extends keyof UserSettings>(
      key: K,
      value: Partial<NonNullable<UserSettings[K]>>
    ) => {
      setDirty(true);
      setSettings((s) => ({
        ...s,
        [key]: { ...((s[key] ?? {}) as object), ...(value as object) },
      }));
    },
    []
  );

  const save = useCallback(
    async (successMsg = "Settings saved.") => {
      setSaving(true);
      setStatus(null);
      try {
        const saved = await updateUserSettings(settings);
        setSettings(saved);
        setDirty(false);
        if (successMsg) setStatus({ type: "success", msg: successMsg });
      } catch (err) {
        setStatus({
          type: "error",
          msg: err instanceof Error ? err.message : "Something went wrong. Please try again.",
        });
      } finally {
        setSaving(false);
      }
    },
    [settings]
  );

  /* ── Auto-save: debounce a PATCH after every user edit ───────────────────
     `save` only changes identity when `settings` change, so the timer below
     is armed by real edits and re-armed (extending the debounce) only when
     the user keeps editing — nothing else re-triggers it. */
  useEffect(() => {
    if (!dirty || loading || saving) return;
    const t = setTimeout(() => {
      // Silent success message — the "Changes save automatically" footer is
      // the only feedback needed; errors still surface through the banner.
      void save("");
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [dirty, loading, saving, save]);

  /** Mark unsaved user changes for the auto-save effect (for sections that
      own extra state, e.g. the write-only OpenRouter key field). */
  const markDirty = useCallback(() => setDirty(true), []);

  return { loading, saving, dirty, settings, status, setStatus, patch, patchGroup, save, markDirty };
}
