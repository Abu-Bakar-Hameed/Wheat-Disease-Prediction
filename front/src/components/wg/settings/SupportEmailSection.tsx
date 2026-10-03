"use client";

/**
 * Support Email settings section (spec §30).
 *
 * Self-contained: owns its own fetch/save state. The `email_support`
 * preference lives in the auth service's notification_preferences table,
 * so this reads/writes through supportApi (NOT the FastAPI settings route),
 * keeping the toggle functional without depending on legacy plumbing.
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { fetchSupportEmailPref, saveSupportEmailPref } from "@/lib/supportApi";
import { AutoSaveRow, Banner, SkeletonRows, ToggleRow, getErrorMessage } from "./shared";

export function SupportEmailSection() {
  const { email } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [status, setStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  useEffect(() => {
    fetchSupportEmailPref()
      .then(setEnabled)
      .catch(() => {/* keep default */})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setStatus(null);
    try {
      await saveSupportEmailPref(enabled);
      setDirty(false);
      setStatus({ type: "success", msg: "Support email preference saved." });
    } catch (err) {
      setStatus({ type: "error", msg: getErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  }, [enabled]);

  /* Auto-save as soon as the toggle flips (short debounce, so rapid double
     toggles collapse into one write). */
  useEffect(() => {
    if (!dirty || loading || saving) return;
    const t = setTimeout(() => void handleSave(), 500);
    return () => clearTimeout(t);
  }, [dirty, loading, saving, handleSave]);

  if (loading) return <SkeletonRows count={2} />;

  return (
    <div className="space-y-0">
      {status && (
        <div className="mb-4">
          <Banner type={status.type} message={status.msg} onDismiss={() => setStatus(null)} />
        </div>
      )}

      <ToggleRow
        id="email-support"
        label="Support reply emails"
        description={`Email me a copy whenever the support team replies to one of my queries. Sent to: ${email || "your account address"}. You'll always still see replies in-app.`}
        badge="Emails you"
        checked={enabled}
        onChange={(v) => {
          setDirty(true);
          setEnabled(v);
        }}
      />

      <AutoSaveRow saving={saving} />
    </div>
  );
}
