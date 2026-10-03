"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/appState";
import { useAuth } from "@/lib/auth";

function LogoutModal() {
  const router = useRouter();
  const { closeModal, setRole } = useApp();
  const { signOut } = useAuth();
  const [busy, setBusy] = useState(false);

  const handleSignOut = async () => {
    setBusy(true);

    try {
      await signOut();
      setRole("guest");
      closeModal();
      window.location.href = "/";
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm space-y-4 rounded-xl border border-line bg-white p-6 shadow-xl">

        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft text-danger">
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 24 }}
          >
            logout
          </span>
        </div>

        <div className="space-y-1 text-center">
          <h3 className="text-[16px] font-semibold text-ink">
            Disconnect Session?
          </h3>

          <p className="text-[12px] text-muted">
            You will be signed out from your active field workspace session.
          </p>
        </div>

        <div className="flex gap-3 pt-2">

          <button
            type="button"
            onClick={closeModal}
            className="flex-1 rounded-lg border border-line py-2 text-[13px] text-ink transition-colors hover:bg-[#eaedff]"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={() => void handleSignOut()}
            disabled={busy}
            className="flex-1 rounded-lg bg-danger py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "Signing Out..." : "Sign Out"}
          </button>

        </div>
      </div>
    </div>
  );
}

function DiseaseModal() {
  const { closeModal } = useApp();

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg space-y-4 rounded-xl border border-line bg-white p-6 shadow-xl">

        <div className="flex items-center justify-between border-b border-line pb-3">

          <h3 className="text-[16px] font-semibold text-brand-900">
            Register New Foliar Pathogen
          </h3>

          <button
            type="button"
            onClick={closeModal}
            className="text-muted hover:text-brand-900"
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 20 }}
            >
              close
            </span>
          </button>

        </div>

        <div className="space-y-3 text-[12px]">

          <div>
            <label className="mb-1 block text-[13px] font-medium text-ink">
              Scientific Binomial Name
            </label>

            <input
              type="text"
              placeholder="e.g. Fusarium graminearum"
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-[14px] outline-none focus:border-brand-700"
            />
          </div>

          <div>
            <label className="mb-1 block text-[13px] font-medium text-ink">
              Common Pathology Name
            </label>

            <input
              type="text"
              placeholder="e.g. Fusarium Head Blight (Scab)"
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-[14px] outline-none focus:border-brand-700"
            />
          </div>

        </div>

        <div className="flex justify-end gap-2 border-t border-line pt-4">

          <button
            type="button"
            onClick={closeModal}
            className="rounded-lg border border-line px-4 py-2 text-[13px] text-ink hover:bg-[#eaedff]"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={closeModal}
            className="rounded-lg bg-brand-700 px-4 py-2 text-[13px] font-bold text-white hover:opacity-90"
          >
            Register & Retrain
          </button>

        </div>
      </div>
    </div>
  );
}

export function Modals() {
  const { modal } = useApp();

  if (!modal) {
    return null;
  }

  if (modal === "logout") {
    return <LogoutModal />;
  }

  if (modal === "disease") {
    return <DiseaseModal />;
  }

  return null;
}