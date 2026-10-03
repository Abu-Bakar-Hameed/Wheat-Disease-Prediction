"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/wg/ui";
import { cn } from "@/lib/utils";

/**
 * CameraCapture — a mobile-first, full-screen leaf-scanner camera built on the
 * browser MediaDevices API.
 *
 *  • Fixed full-viewport layout; the <video> uses object-cover + playsInline so
 *    it fills the phone screen without handing off to a native fullscreen player.
 *  • Top bar: hardware torch toggle (left, via track capabilities with safe
 *    fallbacks) and close (right).
 *  • Center: a dashed scanning frame with a floating instruction badge.
 *  • Bottom: a guidelines checklist, a centered shutter, and a lens switch.
 *  • Every stream is released with track.stop() on unmount and when switching
 *    cameras, so the hardware indicator turns off and no streams leak.
 *
 * Drop-in usage:
 *   {open && <CameraCapture onClose={() => setOpen(false)} onCapture={(f, url) => …} />}
 */

export interface CameraCaptureProps {
  /** Fired with the captured still (JPEG File + an object-URL preview). */
  onCapture: (file: File, previewUrl: string) => void;
  /** Close / exit — wired to the top-right button and the Escape key. */
  onClose: () => void;
  /** Which lens to open with. Defaults to the rear (environment) camera. */
  initialFacingMode?: "user" | "environment";
  /** Text for the floating instruction badge over the scanning frame. */
  instruction?: string;
}

type FacingMode = "user" | "environment";

const GUIDELINES = ["One leaf in frame", "Good lighting", "Keep in focus"];

export function CameraCapture({
  onCapture,
  onClose,
  initialFacingMode = "environment",
  instruction = "Keep the wheat leaf inside the frame",
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [facingMode, setFacingMode] = useState<FacingMode>(initialFacingMode);
  const [starting, setStarting] = useState(true);
  const [error, setError] = useState("");
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  // Release the camera hardware: stop every track and detach it from the video.
  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const start = useCallback(
    async (mode: FacingMode) => {
      setStarting(true);
      setError("");
      stopStream();
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera access is not supported by this browser.");
        }
        if (typeof window !== "undefined" && !window.isSecureContext) {
          throw new Error("The camera needs a secure connection (https:// or localhost).");
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        streamRef.current = stream;

        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }

        // Detect hardware torch support from the live track's capabilities.
        const track = stream.getVideoTracks()[0];
        const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & {
          torch?: boolean;
          mozTorch?: boolean;
        };
        setTorchSupported(Boolean(caps.torch || caps.mozTorch));
        setTorchOn(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unable to start the camera.");
      } finally {
        setStarting(false);
      }
    },
    [stopStream]
  );

  // Start on mount and whenever the lens changes; tear the old stream down first.
  // The start is deferred to a microtask so its state updates don't run
  // synchronously in the effect body (avoids a cascading-render warning) while
  // still executing before the browser paints.
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void start(facingMode);
    });
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [facingMode, start, stopStream]);

  // Escape closes the camera.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    // Chrome/Android use `advanced: [{ torch }]`; some builds accept a flat
    // `torch`. Try both, then degrade gracefully if neither is honoured.
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] } as unknown as MediaTrackConstraints);
      setTorchOn(next);
    } catch {
      try {
        await track.applyConstraints({ torch: next } as unknown as MediaTrackConstraints);
        setTorchOn(next);
      } catch {
        setError("Torch isn't supported on this camera.");
      }
    }
  };

  // Switching lenses just flips facingMode; the effect restarts the stream and
  // its cleanup stops the previous one, so no tracks leak.
  const switchCamera = () => setFacingMode((m) => (m === "user" ? "environment" : "user"));

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setError("Camera is still starting — please wait a moment.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError("Unable to capture the image.");
      return;
    }
    // Grab the full raw frame (never the on-screen crop), so predictions see the
    // complete picture regardless of the object-cover preview.
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("Could not capture the photo.");
          return;
        }
        const file = new File([blob], `leaf-${Date.now()}.jpg`, { type: "image/jpeg" });
        onCapture(file, URL.createObjectURL(blob));
      },
      "image/jpeg",
      0.92
    );
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-between overflow-hidden bg-black text-white">
      {/* LIVE VIDEO — fills the viewport; mirrored only for the selfie lens. */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={cn(
          "absolute inset-0 h-full w-full bg-black object-cover",
          facingMode === "user" && "scale-x-[-1]"
        )}
      />

      {/* TOP BAR — torch (left) + close (right) */}
      <div className="relative z-10 flex items-center justify-between gap-3 bg-gradient-to-b from-black/70 to-transparent px-4 pb-12 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => void toggleTorch()}
          disabled={!torchSupported}
          aria-pressed={torchOn}
          title={torchSupported ? "Toggle flash" : "Flash not supported on this camera"}
          className={cn(
            "flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-[13px] font-semibold backdrop-blur transition",
            torchSupported ? "hover:bg-white/25 active:scale-95" : "cursor-not-allowed opacity-40"
          )}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
            {torchOn ? "flashlight_on" : "flashlight_off"}
          </span>
          {torchOn ? "Flash On" : "Flash Off"}
        </button>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close camera"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 backdrop-blur transition hover:bg-white/25 active:scale-95"
        >
          <Icon name="close" size={22} />
        </button>
      </div>

      {/* CENTER — dashed scanning frame + floating instruction badge */}
      <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center px-6">
        <div className="relative w-[85%] max-w-sm aspect-[4/3]">
          <div className="absolute inset-0 rounded-2xl border-2 border-dashed border-white/70" />
          {/* corner brackets */}
          <span className="absolute -left-1 -top-1 h-8 w-8 rounded-tl-2xl border-l-4 border-t-4 border-emerald-400" />
          <span className="absolute -right-1 -top-1 h-8 w-8 rounded-tr-2xl border-r-4 border-t-4 border-emerald-400" />
          <span className="absolute -bottom-1 -left-1 h-8 w-8 rounded-bl-2xl border-b-4 border-l-4 border-emerald-400" />
          <span className="absolute -bottom-1 -right-1 h-8 w-8 rounded-br-2xl border-b-4 border-r-4 border-emerald-400" />
          {/* floating badge */}
          <div className="absolute inset-x-0 -top-3 flex justify-center">
            <span className="rounded-full bg-black/60 px-3.5 py-1.5 text-[11px] font-semibold text-white backdrop-blur">
              {instruction}
            </span>
          </div>
        </div>
      </div>

      {/* BOTTOM — guidelines + shutter + lens switch */}
      <div className="relative z-10 flex flex-col items-center gap-6 bg-gradient-to-t from-black/85 to-transparent px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-12">
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-center text-[11px] text-white/75">
          {GUIDELINES.map((g) => (
            <span key={g}>✓ {g}</span>
          ))}
        </div>

        <div className="grid w-full max-w-md grid-cols-3 items-center">
          {/* left cell kept empty so the shutter stays perfectly centred */}
          <div />
          <div className="flex justify-center">
            <button
              type="button"
              onClick={capture}
              disabled={starting}
              aria-label="Capture photo"
              className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-white/20 shadow-xl backdrop-blur transition hover:scale-105 active:scale-95 disabled:opacity-50"
            >
              <span className="h-14 w-14 rounded-full bg-white" />
            </button>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={switchCamera}
              aria-label="Switch camera"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 backdrop-blur transition hover:bg-white/25 active:scale-95"
            >
              <Icon name="flip_camera_android" size={24} />
            </button>
          </div>
        </div>
      </div>

      {/* STARTING OVERLAY */}
      {starting && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70">
          <div className="text-center text-white">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-white" />
            <p className="mt-4 text-sm font-semibold">Starting camera…</p>
          </div>
        </div>
      )}

      {/* ERROR TOAST */}
      {error && (
        <div className="absolute inset-x-0 bottom-40 z-30 mx-auto flex max-w-sm items-center gap-2 rounded-xl border border-[#fca5a5] bg-danger-soft px-4 py-3 text-[13px] text-danger shadow-lg">
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>error</span>
          <span className="min-w-0 flex-1">{error}</span>
          <button type="button" onClick={() => setError("")} aria-label="Dismiss" className="shrink-0">
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
    </div>,
    document.body
  );
}

export default CameraCapture;
