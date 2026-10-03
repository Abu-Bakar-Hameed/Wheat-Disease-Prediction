"use client";

/**
 * Notifications (Settings → Notifications).
 *
 * A single category × channel matrix that MERGES the two former sections
 * (Email Alerts + In-App Notifications) into one honest view. Every cell is
 * wired to the store that actually delivers it today:
 *   • Email channel   → the `email_*` columns on user_settings (FastAPI), which
 *                       the disease/report/digest email producers honour.
 *   • In-app channel  → the auth service's NotificationPreferences, which the
 *                       in-app bell producer honours.
 * A cell with no backing producer renders as a disabled "—" rather than
 * pretending to gate a channel the backend never sends. Saving writes BOTH
 * stores; each is partial-merged server-side so nothing else is clobbered.
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  fetchUserSettings,
  updateUserSettings,
  fetchNotificationPreferences,
  saveNotificationPreferences,
  type UserSettings,
  type NotificationPreferences,
} from "@/lib/api";
import { AutoSaveRow, Banner, SectionIntro, SkeletonRows, Toggle, getErrorMessage } from "./shared";

type Channel = "in_app" | "email";

interface Row {
  key: string;
  label: string;
  description: string;
  inApp: keyof NotificationPreferences | null;
  email: keyof UserSettings | null;
}

const ROWS: Row[] = [
  {
    key: "disease",
    label: "High & critical disease detections",
    description: "When a scan comes back as a serious disease.",
    inApp: "high_risk",
    email: "email_high_severity_alerts",
  },
  {
    key: "weather",
    label: "Weather risk warnings",
    description: "When climate conditions raise infection risk for your region.",
    inApp: "weather_warnings",
    email: null,
  },
  {
    key: "report",
    label: "AI report ready",
    description: "When a full AI diagnosis report finishes generating.",
    inApp: null,
    email: "email_report_ready",
  },
  {
    key: "daily",
    label: "Daily activity digest",
    description: "A morning summary of processed scans and field conditions.",
    inApp: "daily_digest",
    email: null,
  },
  {
    key: "weekly",
    label: "Weekly summary",
    description: "Your weekly scan statistics and trends.",
    inApp: "weekly_email",
    email: "email_weekly_digest",
  },
];

function Cell({ on, onChange, disabled, id }: { on: boolean; onChange: (v: boolean) => void; disabled: boolean; id: string }) {
  if (disabled) {
    return (
      <span className="inline-flex justify-center text-muted" title="This channel isn't sent by the app yet">
        —
      </span>
    );
  }
  return <Toggle id={id} checked={on} onChange={onChange} />;
}

export function NotificationsSection() {
  const { email } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [settings, setSettings] = useState<UserSettings>({});
  const [prefs, setPrefs] = useState<NotificationPreferences>({
    high_risk: true,
    daily_digest: true,
    weekly_email: false,
    weather_warnings: true,
  });
  const [status, setStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetchUserSettings().catch(() => null),
      fetchNotificationPreferences().catch(() => null),
    ]).then(([s, p]) => {
      if (!alive) return;
      if (s) setSettings(s);
      if (p) setPrefs(p);
    }).finally(() => {
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const isOn = (row: Row, ch: Channel): boolean => {
    if (ch === "email") {
      const k = row.email;
      return k ? Boolean(settings[k]) : false;
    }
    const k = row.inApp;
    return k ? Boolean(prefs[k]) : false;
  };

  const setVal = (row: Row, ch: Channel, v: boolean) => {
    if (ch === "email" && row.email) {
      setDirty(true);
      setSettings((p) => ({ ...p, [row.email as string]: v }));
    } else if (ch === "in_app" && row.inApp) {
      setDirty(true);
      setPrefs((p) => ({ ...p, [row.inApp as string]: v }));
    }
  };

  const handleSave = useCallback(async () => {
    setSaving(true);
    setStatus(null);
    try {
      // Only send the email_* fields we own (partial merge on the server keeps
      // every other setting intact), plus the in-app prefs to the auth service.
      await updateUserSettings({
        email_high_severity_alerts: settings.email_high_severity_alerts,
        email_report_ready: settings.email_report_ready,
        email_weekly_digest: settings.email_weekly_digest,
      });
      await saveNotificationPreferences(prefs);
      setDirty(false);
      setStatus({ type: "success", msg: "Notification settings saved." });
    } catch (err) {
      setStatus({ type: "error", msg: getErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  }, [settings, prefs]);

  /* Auto-save the matrix a short debounce after any cell is toggled. */
  useEffect(() => {
    if (!dirty || loading || saving) return;
    const t = setTimeout(() => void handleSave(), 800);
    return () => clearTimeout(t);
  }, [dirty, loading, saving, handleSave]);

  if (loading) return <SkeletonRows count={5} />;

  return (
    <div className="space-y-1">
      <SectionIntro
        title="What you want to hear about, and where"
        description={`Alert emails go to ${email || "your account address"}. A "—" means the app doesn't send that channel yet, so there's nothing to toggle.`}
      />

      {/* Header row */}
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-line pb-2">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-muted">Category</span>
        <span className="w-11 text-center text-[12px] font-semibold uppercase tracking-wide text-muted">In-app</span>
        <span className="w-11 text-center text-[12px] font-semibold uppercase tracking-wide text-muted">Email</span>
      </div>

      {ROWS.map((row) => (
        <div key={row.key} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-line py-3.5 last:border-0">
          <div className="min-w-0 pr-2">
            <p className="text-[14px] font-medium text-ink">{row.label}</p>
            <p className="text-[12px] text-muted mt-0.5 leading-relaxed">{row.description}</p>
          </div>
          <div className="flex w-11 justify-center">
            <Cell id={`notif-${row.key}-inapp`} on={isOn(row, "in_app")} disabled={!row.inApp} onChange={(v) => setVal(row, "in_app", v)} />
          </div>
          <div className="flex w-11 justify-center">
            <Cell id={`notif-${row.key}-email`} on={isOn(row, "email")} disabled={!row.email} onChange={(v) => setVal(row, "email", v)} />
          </div>
        </div>
      ))}

      {status && (
        <div className="pt-4">
          <Banner type={status.type} message={status.msg} onDismiss={() => setStatus(null)} />
        </div>
      )}

      <AutoSaveRow saving={saving} />
    </div>
  );
}
