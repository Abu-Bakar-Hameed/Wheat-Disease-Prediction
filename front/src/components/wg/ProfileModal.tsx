"use client";

import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useApp } from "@/lib/appState";
import { useAuth } from "@/lib/auth";
import {
  fetchUserProfile,
  updateUserProfile,
  changeUserPassword,
  type UserProfile,
} from "@/lib/api";

/* ============================================================================
   HELPERS
============================================================================ */

function getErrMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Something went wrong. Please try again.";
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB

/* ── Small reusable field ────────────────────────────────────────────────── */
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-[14px] text-ink outline-none transition placeholder:text-muted focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:focus:ring-brand-900/60 disabled:bg-surface-muted disabled:text-muted";

/* ── Inline banner ───────────────────────────────────────────────────────── */
function Banner({
  type,
  message,
}: {
  type: "success" | "error";
  message: string;
}) {
  const cls =
    type === "success"
      ? "bg-brand-50 border-brand-200 text-brand-800 dark:bg-brand-950/40 dark:border-brand-800/50 dark:text-brand-300"
      : "bg-danger-soft border-danger/30 text-danger";
  return (
    <div className={`rounded-xl border px-4 py-3 text-[13px] font-medium ${cls}`}>
      {message}
    </div>
  );
}

/* ============================================================================
   PROPS
============================================================================ */

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/* ============================================================================
   COMPONENT
============================================================================ */

export function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const { avatarUrl, setAvatarUrl } = useApp();
  const { displayName, email, initials } = useAuth();

  /* ── profile data ────────────────────────────────────────────────────── */
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [loading, setLoading] = useState(false);

  /* ── editable fields ─────────────────────────────────────────────────── */
  const [fullName,  setFullName]  = useState("");
  const [phone,     setPhone]     = useState("");
  const [farmName,  setFarmName]  = useState("");
  const [location,  setLocation]  = useState("");
  const [bio,       setBio]       = useState("");
  const [locating,  setLocating]  = useState(false);
  const [locationErr, setLocationErr] = useState("");

  /* ── avatar ──────────────────────────────────────────────────────────── */
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const [avatarFile,  setAvatarFile]  = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarErr,   setAvatarErr]   = useState("");

  /* ── save ────────────────────────────────────────────────────────────── */
  const [saving,    setSaving]    = useState(false);
  const [saveMsg,   setSaveMsg]   = useState<{ type: "success" | "error"; text: string } | null>(null);

  /* ── password ────────────────────────────────────────────────────────── */
  const [pwOpen,    setPwOpen]    = useState(false);
  const [curPw,     setCurPw]     = useState("");
  const [newPw,     setNewPw]     = useState("");
  const [confPw,    setConfPw]    = useState("");
  const [pwSaving,  setPwSaving]  = useState(false);
  const [pwMsg,     setPwMsg]     = useState<{ type: "success" | "error"; text: string } | null>(null);

  /* ── load profile when modal opens ──────────────────────────────────── */
  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    setLoadErr("");
    setSaveMsg(null);
    setPwMsg(null);
    setPwOpen(false);
    setAvatarFile(null);
    setAvatarPreview(null);
    setAvatarErr("");

    fetchUserProfile()
      .then((p) => {
        setProfile(p);
        setFullName(p.full_name ?? displayName ?? "");
        setPhone(p.phone ?? "");
        setFarmName(p.farm_name ?? "");
        setLocation(p.location ?? "");
        setBio(p.bio ?? "");
        if (p.avatar_url) setAvatarUrl(p.avatar_url);
      })
      .catch((err) => setLoadErr(getErrMsg(err)))
      .finally(() => setLoading(false));
  }, [isOpen]);

  /* ── body scroll lock ────────────────────────────────────────────────── */
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  /* ── Escape to close ─────────────────────────────────────────────────── */
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  /* ── avatar file pick ────────────────────────────────────────────────── */
  function handleAvatarPick(e: ChangeEvent<HTMLInputElement>) {
    setAvatarErr("");
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setAvatarErr("Please select an image file (JPG, PNG, WebP).");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarErr("Image must be under 5 MB.");
      return;
    }

    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    e.target.value = "";
  }

  /* ── save profile ────────────────────────────────────────────────────── */
  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveMsg(null);
    setAvatarErr("");

    try {
      const updated = await updateUserProfile({
        full_name: fullName.trim() || undefined,
        phone:     phone.trim()    || undefined,
        farm_name: farmName.trim() || undefined,
        location:  location.trim() || undefined,
        bio:       bio.trim()      || undefined,
        avatar:    avatarFile      ?? undefined,
      });

      setProfile(updated);

      // If we sent an avatar and the backend returned a URL, use it.
      // If the backend couldn't upload (bucket missing etc.) avatar_url will
      // be null — in that case keep the local blob preview so the user still
      // sees their chosen photo in this session.
      const newUrl = updated.avatar_url ?? null;
      if (newUrl) {
        // Persist the remote URL globally (UserTopBar will pick it up)
        setAvatarUrl(newUrl);
        // Now it's safe to revoke the local blob — we have a permanent URL
        if (avatarPreview) {
          URL.revokeObjectURL(avatarPreview);
          setAvatarPreview(null);
        }
        setAvatarFile(null);
      } else if (avatarFile) {
        // Upload was attempted but no URL came back — keep blob preview alive
        // so the circle still shows the chosen image, and warn the user.
        setSaveMsg({
          type: "error",
          text: "Profile saved, but the avatar image could not be uploaded. Make sure the 'avatars' Storage bucket exists in Supabase.",
        });
        setSaving(false);
        return;
      }

      setSaveMsg({ type: "success", text: "Profile updated successfully." });
    } catch (err) {
      setSaveMsg({ type: "error", text: getErrMsg(err) });
      // Do NOT revoke preview on error — keep it visible
    } finally {
      setSaving(false);
    }
  }

  /* ── change password ─────────────────────────────────────────────────── */
  async function handleChangePassword() {
    setPwMsg(null);

    if (newPw.length < 8) {
      setPwMsg({ type: "error", text: "New password must be at least 8 characters." });
      return;
    }
    if (newPw !== confPw) {
      setPwMsg({ type: "error", text: "New password and confirmation do not match." });
      return;
    }

    setPwSaving(true);
    try {
      await changeUserPassword({ currentPassword: curPw, newPassword: newPw });
      setCurPw(""); setNewPw(""); setConfPw("");
      setPwMsg({ type: "success", text: "Password changed successfully." });
    } catch (err) {
      setPwMsg({ type: "error", text: getErrMsg(err) });
    } finally {
      setPwSaving(false);
    }
  }

  /* ── cleanup blob on unmount ─────────────────────────────────────────── */
  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  if (!isOpen) return null;

  /* ── derived avatar display ──────────────────────────────────────────── */
  // Priority: local blob preview (just picked) > remote URL from global state
  // > remote URL from just-fetched profile row > nothing (show initials)
  const shownAvatar =
    avatarPreview ??          // file just picked, not yet saved
    (avatarUrl || null) ??    // saved URL in global app state (persists across modal opens)
    profile?.avatar_url ??    // URL returned from the last profile fetch
    null;

  /* ── render ──────────────────────────────────────────────────────────── */
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-surface shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="My Profile"
      >
        {/* ── Sticky header ── */}
        <div className="sticky top-0 z-20 flex shrink-0 items-center justify-between border-b border-line bg-surface px-6 py-4">
          <h2 className="text-lg font-bold text-ink">My Profile</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close profile"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-surface-muted hover:text-ink"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            /* Skeleton */
            <div className="space-y-4 px-6 py-5">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 animate-pulse rounded-full bg-surface-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 animate-pulse rounded bg-surface-muted" />
                  <div className="h-3 w-48 animate-pulse rounded bg-surface-muted" />
                </div>
              </div>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-xl bg-surface-muted" />
              ))}
            </div>
          ) : loadErr ? (
            <div className="px-6 py-5">
              <Banner type="error" message={loadErr} />
            </div>
          ) : (
            <form id="profile-form" onSubmit={handleSave} noValidate>
              <div className="space-y-5 px-6 py-5">

                {/* ── Avatar + name header ── */}
                <div className="flex items-center gap-4">
                  <div className="relative shrink-0">
                    {shownAvatar ? (
                      <img
                        src={shownAvatar}
                        alt="Profile avatar"
                        className="h-16 w-16 rounded-full object-cover ring-2 ring-brand-100"
                      />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-700 text-xl font-bold text-white ring-2 ring-brand-100">
                        {initials}
                      </div>
                    )}
                    {/* Camera button */}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-surface shadow-md ring-1 ring-line transition hover:bg-brand-50 dark:hover:bg-brand-900/40"
                      aria-label="Change profile photo"
                      title="Change photo"
                    >
                      <span className="material-symbols-outlined text-muted" style={{ fontSize: 14 }}>
                        photo_camera
                      </span>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarPick}
                      className="hidden"
                    />
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold text-ink">
                      {profile?.full_name || displayName || "—"}
                    </p>
                    <p className="truncate text-[13px] text-muted">{email}</p>
                    {profile?.member_since && (
                      <p className="text-[11px] text-muted">
                        Member since {formatDate(profile.member_since)}
                      </p>
                    )}
                  </div>
                </div>

                {/* Avatar error */}
                {avatarErr && <Banner type="error" message={avatarErr} />}

                {/* Avatar file hint */}
                {avatarFile && !avatarErr && (
                  <p className="text-[12px] text-brand-600 dark:text-brand-400">
                    📷 New photo selected — click Save to upload.
                  </p>
                )}

                {/* ── Stat tiles ── */}
                {(profile?.total_scans !== undefined || profile?.high_severity_count !== undefined) && (
                  <div className="grid grid-cols-2 gap-3">
                    {profile?.total_scans !== undefined && (
                      <div className="rounded-2xl bg-surface-muted p-3 text-center">
                        <p className="text-2xl font-bold text-ink">{profile.total_scans}</p>
                        <p className="mt-0.5 text-[11px] text-muted">Total Scans</p>
                      </div>
                    )}
                    {profile?.high_severity_count !== undefined && (
                      <div className="rounded-2xl bg-danger-soft p-3 text-center">
                        <p className="text-2xl font-bold text-danger">{profile.high_severity_count}</p>
                        <p className="mt-0.5 text-[11px] text-muted">High-severity</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Editable fields ── */}
                <Field label="Full Name">
                  <input
                    className={inputCls}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your full name"
                    maxLength={100}
                  />
                </Field>

                <Field label="Email">
                  <input
                    className={inputCls}
                    value={email}
                    readOnly
                    disabled
                    title="Email cannot be changed here"
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Phone">
                    <input
                      className={inputCls}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+1 555 000 0000"
                      type="tel"
                      maxLength={30}
                    />
                  </Field>
                  <Field label="Location">
                    <div className="flex gap-2">
                      <input
                        className={inputCls}
                        value={location}
                        onChange={(e) => { setLocation(e.target.value); setLocationErr(""); }}
                        placeholder="City, Country"
                        maxLength={80}
                      />
                      <button
                        type="button"
                        title="Auto-detect my location"
                        disabled={locating}
                        onClick={async () => {
                          setLocationErr("");
                          if (!navigator.geolocation) {
                            setLocationErr("Geolocation is not supported by your browser.");
                            return;
                          }
                          setLocating(true);
                          navigator.geolocation.getCurrentPosition(
                            async ({ coords }) => {
                              try {
                                const res = await fetch(
                                  `https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json`,
                                  { headers: { "Accept-Language": "en" } }
                                );
                                const data = await res.json();
                                const a = data?.address ?? {};
                                const city =
                                  a.city ?? a.town ?? a.village ?? a.county ?? "";
                                const country = a.country ?? "";
                                const label = [city, country].filter(Boolean).join(", ");
                                setLocation(label || `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`);
                              } catch {
                                setLocationErr("Could not resolve address. Try again.");
                              } finally {
                                setLocating(false);
                              }
                            },
                            (err) => {
                              setLocating(false);
                              if (err.code === 1) {
                                setLocationErr("Location permission denied. Please allow access and try again.");
                              } else {
                                setLocationErr("Could not get your location. Please enter it manually.");
                              }
                            },
                            { timeout: 10000, maximumAge: 60000 }
                          );
                        }}
                        className="flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-[12px] font-semibold text-muted transition hover:border-brand-400 hover:text-brand-700 dark:hover:text-brand-300 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {locating ? (
                          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-brand-600" />
                        ) : (
                          <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                            my_location
                          </span>
                        )}
                        <span className="hidden sm:inline">{locating ? "Detecting…" : "Detect"}</span>
                      </button>
                    </div>
                    {locationErr && (
                      <p className="mt-1.5 text-[11px] text-danger">{locationErr}</p>
                    )}
                  </Field>
                </div>

                <Field label="Farm / Organisation">
                  <input
                    className={inputCls}
                    value={farmName}
                    onChange={(e) => setFarmName(e.target.value)}
                    placeholder="Farm or organisation name"
                    maxLength={100}
                  />
                </Field>

                <Field label="Bio">
                  <textarea
                    className={inputCls}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="A short bio…"
                    rows={3}
                    maxLength={300}
                  />
                  <p className="mt-1 text-right text-[11px] text-muted">
                    {bio.length}/300
                  </p>
                </Field>

                {/* Save banner */}
                {saveMsg && <Banner type={saveMsg.type} message={saveMsg.text} />}

              </div>

              {/* ── Change Password section ── */}
              <div className="border-t border-line px-6 py-4">
                <button
                  type="button"
                  onClick={() => { setPwOpen((v) => !v); setPwMsg(null); }}
                  className="flex w-full items-center justify-between text-[13px] font-semibold text-ink transition hover:text-brand-700 dark:hover:text-brand-300"
                >
                  <span className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-muted" style={{ fontSize: 17 }}>lock</span>
                    Change Password
                  </span>
                  <span
                    className={`material-symbols-outlined text-muted transition-transform duration-200 ${pwOpen ? "rotate-180" : ""}`}
                    style={{ fontSize: 18 }}
                  >
                    expand_more
                  </span>
                </button>

                {pwOpen && (
                  <div className="mt-4 space-y-3">
                    <Field label="Current Password">
                      <input
                        type="password"
                        className={inputCls}
                        value={curPw}
                        onChange={(e) => setCurPw(e.target.value)}
                        autoComplete="current-password"
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleChangePassword(); } }}
                      />
                    </Field>
                    <Field label="New Password">
                      <input
                        type="password"
                        className={inputCls}
                        value={newPw}
                        onChange={(e) => setNewPw(e.target.value)}
                        autoComplete="new-password"
                        placeholder="Min. 8 characters"
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleChangePassword(); } }}
                      />
                    </Field>
                    <Field label="Confirm New Password">
                      <input
                        type="password"
                        className={inputCls}
                        value={confPw}
                        onChange={(e) => setConfPw(e.target.value)}
                        autoComplete="new-password"
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleChangePassword(); } }}
                      />
                    </Field>

                    {pwMsg && <Banner type={pwMsg.type} message={pwMsg.text} />}

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => void handleChangePassword()}
                        disabled={pwSaving || !curPw || !newPw || !confPw}
                        className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-[13px] font-semibold text-ink transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {pwSaving && (
                          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-brand-600" />
                        )}
                        {pwSaving ? "Updating…" : "Update Password"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </form>
          )}
        </div>

        {/* ── Sticky footer ── */}
        {!loading && !loadErr && (
          <div className="sticky bottom-0 flex shrink-0 items-center justify-between gap-3 border-t border-line bg-surface px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-line bg-surface px-4 py-2.5 text-[13px] font-semibold text-ink transition hover:bg-surface-muted"
            >
              Close
            </button>

            <button
              type="submit"
              form="profile-form"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-900 px-5 py-2.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-brand-950 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving && (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              )}
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
