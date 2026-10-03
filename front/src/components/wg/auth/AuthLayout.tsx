"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Brand panel clips (served from public/...). The panel plays these clips on
// rotation: each video plays once, then the next one starts (wrapping around).
const BRAND_CLIPS = [
  "/auth/0e13b07e-5fb5-44ef-a670-4cd9115727d9.mp4",
  "/auth/07f9d93c-ef70-4b94-a406-756a0c956d40.mp4",
];
const PLAYBACK_RATE = 0.5; // 0.5× = half-speed slow motion

/**
 * Full-bleed background video that rotates through BRAND_CLIPS: `key` forces a
 * remount on clip change, `onEnded` advances to the next clip. `object-cover`
 * fills the whole panel (cropping edges slightly) with the focus held at ~45%
 * to keep the subject in frame. Muted, slowed down via playbackRate.
 */
function AuthBrandVideo() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [clipIdx, setClipIdx] = useState(0);

  useEffect(() => {
    const v = videoRef.current;
    if (v) v.playbackRate = PLAYBACK_RATE;
  }, [clipIdx]);

  const nextClip = () => setClipIdx((i) => (i + 1) % BRAND_CLIPS.length);

  return (
    <video
      key={BRAND_CLIPS[clipIdx]}
      ref={videoRef}
      className="absolute inset-0 h-full w-full object-cover object-[center_45%]"
      src={BRAND_CLIPS[clipIdx]}
      autoPlay
      muted
      playsInline
      preload="auto"
      onEnded={nextClip}
      onError={nextClip}
      aria-hidden
    />
  );
}

/* ------------------------------------------------------------------ *
 * LEFT PANEL — full-height, full-bleed brand video (no text overlay).
 * Hidden below `lg` so mobile shows only the form.
 * ------------------------------------------------------------------ */
function AuthSidePanel() {
  return (
    <aside className="relative hidden h-dvh overflow-hidden bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 lg:block">
      <AuthBrandVideo />
    </aside>
  );
}

/**
 * Two-column shell for the farmer-facing auth pages (/login, /signup).
 * Left = brand video panel (exactly 50% on lg+, hidden on mobile); right =
 * the form, centred inside its own 50% column.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid h-dvh w-full lg:grid-cols-2">
      <AuthSidePanel />

      {/* right form panel — brand-matched backdrop. No `items-center` here:
          with `overflow-y-auto` it clips the top of tall forms (the tab row)
          and blocks scrolling up to it. The child centres itself via `my-auto`
          instead, which collapses to 0 when the content overflows. */}
      <div className="relative flex justify-center overflow-y-auto overscroll-contain bg-gradient-to-br from-brand-100 via-canvas to-brand-50 px-6 py-6 sm:px-10">
        {/* brand accent glows echoing the left panel's palette */}
        <div
          className="pointer-events-none absolute -left-24 top-1/4 h-80 w-80 rounded-full bg-brand-500/20 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-20 -top-12 h-72 w-72 rounded-full bg-brand-400/20 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-10 right-10 h-72 w-72 rounded-full bg-wheat-500/20 blur-3xl"
          aria-hidden
        />
        <div className="relative z-10 my-auto w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
