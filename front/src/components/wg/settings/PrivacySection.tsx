"use client";

/**
 * Privacy & Data (Settings → Privacy & Data).
 *
 * Action-based section backed by real endpoints:
 *   • Download your data   → GET /api/v1/users/me/export (profile + settings +
 *                            full prediction history as one JSON file).
 *   • Manage shared reports → GET /api/v1/share/mine, with per-item revoke via
 *                            the existing DELETE /api/v1/share/{id}.
 *   • Delete all history   → DELETE /api/v1/history (every prediction row and
 *                            stored image for this account; irreversible).
 *   • Clear assistant chats → wipes the on-device chat stores immediately.
 *
 *   • Deleting a single scan still happens in History; these are the bulk ops.
 */

import { useEffect, useState } from "react";
import {
  exportAccountData,
  fetchMySharedLinks,
  disableShareLink,
  deleteAllHistory,
  type SharedLinkItem,
} from "@/lib/api";
import { useSettingsFormat } from "@/lib/settingsFormat";
import { Banner, SectionIntro, SkeletonRows, getErrorMessage } from "./shared";

// Client-side chat stores (the assistant keeps history on-device only).
const CHAT_HISTORY_KEYS = [
  "wheatguard_chat_history_v3",
  "wheatguard_prediction_history_v1",
  "wheatguard_pending_chat",
];

export function PrivacySection() {
  const { formatDateTime } = useSettingsFormat();
  const [links, setLinks] = useState<SharedLinkItem[]>([]);
  const [loadingShares, setLoadingShares] = useState(true);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetchMySharedLinks().then((items) => {
      if (!alive) return;
      setLinks(items);
      setLoadingShares(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const handleDownload = async () => {
    setDownloading(true);
    setStatus(null);
    try {
      const data = await exportAccountData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "wheatguard-account-data.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus({ type: "success", msg: "Your account data has been downloaded." });
    } catch (err) {
      setStatus({ type: "error", msg: getErrorMessage(err) });
    } finally {
      setDownloading(false);
    }
  };

  const handleRevoke = async (predictionId: string) => {
    setBusy(true);
    setStatus(null);
    try {
      await disableShareLink(predictionId);
      setLinks((prev) => prev.filter((l) => l.prediction_id !== predictionId));
      setStatus({ type: "success", msg: "Share link revoked." });
    } catch (err) {
      setStatus({ type: "error", msg: getErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const clearAssistantChats = () => {
    setStatus(null);
    if (!window.confirm("Erase your saved assistant conversations on this device? This cannot be undone.")) {
      return;
    }
    try {
      CHAT_HISTORY_KEYS.forEach((k) => localStorage.removeItem(k));
      window.dispatchEvent(new CustomEvent("wg:chat-history-cleared"));
      setStatus({ type: "success", msg: "Assistant conversations cleared on this device." });
    } catch (err) {
      setStatus({ type: "error", msg: getErrorMessage(err) });
    }
  };

  const handleDeleteHistory = async () => {
    setStatus(null);
    if (
      !window.confirm(
        "Delete ALL prediction history and stored images? This is permanent and cannot be undone."
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await deleteAllHistory();
      setStatus({
        type: "success",
        msg: `Deleted ${res.deleted ?? 0} prediction${res.deleted === 1 ? "" : "s"}.`,
      });
    } catch (err) {
      setStatus({ type: "error", msg: getErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1">
      <SectionIntro
        title="Your data"
        description="Download everything we store about you, or remove individual scans and shared links."
      />

      {/* Download account data */}
      <div className="flex items-start justify-between gap-4 py-3.5 border-b border-line">
        <div className="min-w-0">
          <p className="text-[14px] font-medium text-ink">Download your data</p>
          <p className="text-[12px] text-muted mt-0.5 leading-relaxed">
            Get a copy of your profile, settings and full prediction history as a JSON file.
          </p>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="shrink-0 rounded-xl border border-line bg-surface px-4 py-2 text-[13px] font-semibold text-ink transition hover:bg-surface-muted disabled:opacity-60"
        >
          {downloading ? "Preparing…" : "Download"}
        </button>
      </div>

      {/* Manage shared reports */}
      <div className="py-3.5 border-b border-line">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[14px] font-medium text-ink">Manage shared reports</p>
            <p className="text-[12px] text-muted mt-0.5 leading-relaxed">
              Predictions that you have made public via a share link. Revoke to take a link down immediately.
            </p>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {loadingShares ? (
            <SkeletonRows count={2} />
          ) : links.length === 0 ? (
            <p className="rounded-xl bg-surface-muted px-4 py-3 text-[13px] text-muted">
              You have no active shared reports.
            </p>
          ) : (
            links.map((l) => (
              <div
                key={l.prediction_id}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium capitalize text-ink">
                    {l.predicted_class.replace(/_/g, " ")}
                  </p>
                  <p className="text-[12px] text-muted">
                    {l.created_at ? formatDateTime(l.created_at) : "Shared report"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRevoke(l.prediction_id)}
                  disabled={busy}
                  className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[12px] font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60 dark:border-red-800/50 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/70"
                >
                  Revoke
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Bulk data operations (both real) */}
      <div className="flex items-start justify-between gap-4 py-3.5 border-b border-line">
        <div className="min-w-0">
          <p className="text-[14px] font-medium text-ink">Delete all history</p>
          <p className="text-[12px] text-muted mt-0.5 leading-relaxed">
            Remove every prediction and stored image at once. Individual scans can also be deleted from History.
          </p>
        </div>
        <button
          type="button"
          onClick={handleDeleteHistory}
          disabled={busy}
          className="shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-[13px] font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-60 dark:border-red-800/50 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/70"
        >
          Delete all
        </button>
      </div>
      <div className="flex items-start justify-between gap-4 py-3.5">
        <div className="min-w-0">
          <p className="text-[14px] font-medium text-ink">Clear assistant conversations</p>
          <p className="text-[12px] text-muted mt-0.5 leading-relaxed">
            Erase your saved chatbot conversations on this device.
          </p>
        </div>
        <button
          type="button"
          onClick={clearAssistantChats}
          className="shrink-0 rounded-xl border border-line bg-surface px-4 py-2 text-[13px] font-semibold text-ink transition hover:bg-surface-muted"
        >
          Clear
        </button>
      </div>

      {status && (
        <div className="pt-4">
          <Banner type={status.type} message={status.msg} onDismiss={() => setStatus(null)} />
        </div>
      )}
    </div>
  );
}
