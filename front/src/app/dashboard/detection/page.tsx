"use client";

import Link from "next/link";
import {
  ChangeEvent,
  DragEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";

import {
  ApiError,
  predictImage,
  getCachedUserSettings,
  type PredictionResponse,
} from "@/lib/api";
import { useApp } from "@/lib/appState";

/* =========================================================
   TYPES
========================================================= */

type TopK = 3 | 5;

type FacingMode = "environment" | "user";

/* =========================================================
   HELPERS
========================================================= */

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message || "Something went wrong.";
  if (error instanceof Error) return error.message || "Something went wrong.";
  return "Something went wrong. Please try again.";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/* =========================================================
   WHEAT-LEAF CONTENT VALIDATOR
   Mirrors the backend heuristic so users get instant feedback.
   Runs entirely in-browser via a hidden canvas.
========================================================= */

function validateWheatLeafContent(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const SIZE = 128;
      const canvas = document.createElement("canvas");
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        resolve(null); // can't validate — allow through
        return;
      }

      ctx.drawImage(img, 0, 0, SIZE, SIZE);
      const { data } = ctx.getImageData(0, 0, SIZE, SIZE); // RGBA flat array

      const totalPixels = SIZE * SIZE;
      let plantLike = 0;
      let rSum = 0, gSum = 0, bSum = 0;
      let rSqSum = 0, gSqSum = 0, bSqSum = 0;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        rSum += r; gSum += g; bSum += b;
        rSqSum += r * r; gSqSum += g * g; bSqSum += b * b;

        // 1. Classic green dominance
        const greenDominant = g > r && g > b && g > 30;
        // 2. Yellow-green / wheat straw
        const yellowGreen =
          r > 80 && g > 80 && b < 120 && Math.abs(r - g) < 80;
        // 3. Muted brown-green (diseased / dry tissue)
        const brownGreen = r > 60 && g > 50 && b < 90 && g > b && r > b;

        if (greenDominant || yellowGreen || brownGreen) plantLike++;
      }

      // Variance check (texture): use std dev of green channel
      const gMean = gSum / totalPixels;
      let gVar = 0;
      for (let i = 0; i < data.length; i += 4) {
        const d = data[i + 1] - gMean;
        gVar += d * d;
      }
      gVar /= totalPixels;

      // Overall brightness std dev (uniformity check)
      const overallMean = (rSum + gSum + bSum) / (totalPixels * 3);
      let overallVar = 0;
      for (let i = 0; i < data.length; i += 4) {
        const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
        const d = lum - overallMean;
        overallVar += d * d;
      }
      overallVar /= totalPixels;

      // 1. Reject near-blank / solid-colour images
      if (Math.sqrt(overallVar) < 15) {
        resolve(
          "The image appears to be blank or a solid colour. " +
          "Please upload a clear photograph of a wheat leaf."
        );
        return;
      }

      // 2. Reject low-texture images
      if (gVar < 100) {
        resolve(
          "The image lacks the detail expected in a wheat leaf photograph. " +
          "Please upload a clear, focused image."
        );
        return;
      }

      // 3. Reject if too few plant-like pixels
      const plantFraction = plantLike / totalPixels;
      if (plantFraction < 0.08) {
        resolve(
          "The image does not appear to contain a wheat leaf. " +
          "Please upload a close-up photograph of a wheat leaf showing the leaf surface clearly."
        );
        return;
      }

      resolve(null); // passed
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null); // can't decode — let backend handle it
    };

    img.src = url;
  });
}

/** Small labelled pill used across the redesigned scan surface. */
function HintRow({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-center gap-2.5 text-[13px] text-muted">
      <span className="material-symbols-outlined text-brand-600" style={{ fontSize: 18 }}>
        {icon}
      </span>
      {text}
    </div>
  );
}

/* =========================================================
   PAGE
========================================================= */

export default function DetectionPage() {
  const router = useRouter();
  const { setLastResult } = useApp();

  /* -------------------------------------------------------
     FILE STATE
  ------------------------------------------------------- */

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [includeGradcam, setIncludeGradcam] = useState(true);
  const [topK, setTopK] = useState<TopK>(3);
  // When "open result automatically" is off, the finished analysis waits here
  // behind a compact inline card instead of jumping to the result page.
  const [inlineResult, setInlineResult] = useState<PredictionResponse | null>(null);

  // Pre-apply the user's Settings → Prediction "default detection method" so
  // the analysis options reflect their choice as soon as the page loads. The
  // write is deferred a microtask to keep the effect body free of synchronous
  // setState calls (react-hooks/set-state-in-effect).
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const method = getCachedUserSettings().prediction_preferences.default_method;
      if (method === "quick") {
        setIncludeGradcam(false);
        setTopK(3);
      } else if (method === "detailed") {
        setIncludeGradcam(true);
        setTopK(5);
      } else {
        // standard (and the legacy "auto") → heatmap + top 3
        setIncludeGradcam(true);
        setTopK(3);
      }
    });
    return () => { cancelled = true; };
  }, []);

  /* -------------------------------------------------------
     CAMERA STATE
  ------------------------------------------------------- */

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [cameraFacingMode, setCameraFacingMode] = useState<FacingMode>("environment");

  /* =========================================================
     FILE SELECTION
  ========================================================= */

  const selectFile = (file: File) => {
    setError("");

    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image file such as JPG, JPEG, PNG or WEBP.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("Image size must be less than 10 MB.");
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setProgress(0);
    setInlineResult(null);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) selectFile(file);
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) selectFile(file);
  };

  /* =========================================================
     CAMERA
  ========================================================= */

  const stopCamera = () => {
    cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
    cameraStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOpen(false);
    setCameraLoading(false);
  };

  const openCamera = async (facingMode: FacingMode = cameraFacingMode) => {
    setCameraError("");
    setCameraLoading(true);

    try {
      stopCamera();

      // Camera APIs only run in a secure context (https:// or localhost).
      // Detect this up-front so we can show a precise, actionable message
      // instead of a generic "permission denied".
      if (typeof window !== "undefined" && !window.isSecureContext) {
        throw new Error(
          "Secure connection required. The camera only works on https:// or " +
          "http://localhost. Open this page over HTTPS (run `npm run dev:https`) " +
          "or via localhost, then try again."
        );
      }

      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera access is not supported by this browser.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });

      cameraStreamRef.current = stream;
      setCameraFacingMode(facingMode);
      setCameraOpen(true);

      requestAnimationFrame(() => {
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.play().catch(() => {});
        }
        setCameraLoading(false);
      });
    } catch (err) {
      setCameraLoading(false);

      if (err instanceof DOMException) {
        if (err.name === "NotAllowedError")
          setCameraError(
            "Camera permission was blocked. Click the camera/lock icon in your " +
            "browser's address bar, set Camera to \u201cAllow\u201d, then press Try " +
            "Again. If it persists, check Windows Settings \u2192 Privacy \u2192 Camera."
          );
        else if (err.name === "NotFoundError")
          setCameraError("No camera was found on this device.");
        else if (err.name === "NotReadableError")
          setCameraError("The camera is already being used by another application. Close other apps using the camera and try again.");
        else if (err.name === "SecurityError")
          setCameraError("Camera access is blocked because this page is not using a secure connection. Open it over HTTPS or localhost.");
        else
          setCameraError("Unable to access the camera. Please try again.");
      } else if (err instanceof Error) {
        setCameraError(err.message);
      } else {
        setCameraError("Unable to access the camera.");
      }
    }
  };

  const switchCamera = () => {
    const next: FacingMode = cameraFacingMode === "environment" ? "user" : "environment";
    setCameraFacingMode(next);
    if (!cameraOpen) return;
    stopCamera();
    window.setTimeout(() => openCamera(next), 150);
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) { setCameraError("Camera is not ready yet."); return; }
    if (!video.videoWidth || !video.videoHeight) { setCameraError("Camera is still starting. Please wait a moment."); return; }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) { setCameraError("Unable to capture the camera image."); return; }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) { setCameraError("Unable to create image from camera."); return; }
        stopCamera();
        selectFile(new File([blob], `wheatguard-camera-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92
    );
  };

  /* =========================================================
     ANALYZE — store in appState then navigate
  ========================================================= */

  const handleAnalyze = async () => {
    if (!selectedFile) {
      setError("Please select or capture an image first.");
      return;
    }

    setError("");
    setLoading(true);
    setProgress(0);

    // Client-side wheat-leaf check — gives instant feedback before upload
    const contentError = await validateWheatLeafContent(selectedFile);
    if (contentError) {
      setError(contentError);
      setLoading(false);
      return;
    }

    try {
      const response = await predictImage(selectedFile, {
        includeGradcam,
        topK,
        onProgress: (pct) => setProgress(pct),
      });

      setProgress(100);

      // Store result + preview URL in shared state.
      setLastResult(response, previewUrl ?? undefined);

      // "Open result automatically" (Settings → Prediction) decides whether we
      // jump straight to the full report or surface a compact inline card so
      // the farmer can review before navigating.
      const openAuto =
        getCachedUserSettings().prediction_preferences.open_result_auto;
      if (openAuto) {
        router.push("/dashboard/detection/result");
      } else {
        setInlineResult(response);
        setLoading(false);
      }
    } catch (err) {
      setError(getErrorMessage(err));
      setLoading(false);
    }
  };

  /* =========================================================
     RESET
  ========================================================= */

  const handleReset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
    setError("");
    setProgress(0);
    setInlineResult(null);
  };

  /* =========================================================
     CLEANUP
  ========================================================= */

  useEffect(() => {
    return () => {
      cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close camera on Escape
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && cameraOpen) stopCamera();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cameraOpen]);

  // The preview fills the screen via CSS object-fit (see the VIDEO block below);
  // no JS letterbox math is needed, and capture always uses the full raw frame.

  /* =========================================================
     UI
  ========================================================= */

  return (
    <main className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">

        {/* =====================================================
            PAGE INTRO
        ===================================================== */}
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[12px] font-semibold text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-900/30 dark:text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              AI-Powered Wheat Leaf Analysis
            </div>
            <h1 className="mt-3 text-[26px] font-bold leading-tight text-brand-900 dark:text-brand-100 sm:text-[30px]">
              Detect Wheat Disease
            </h1>
            <p className="mt-1.5 max-w-xl text-[14px] text-muted">
              Upload a clear image or use your camera to get a prediction of wheat
              diseases.
            </p>
          </div>
          <Link
            href="/dashboard/history"
            className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl border border-line bg-surface px-4 py-2.5 text-[13px] font-semibold text-brand-900 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50 dark:text-brand-100 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/30 sm:self-auto"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>history</span>
            View History
          </Link>
        </header>

        {/* ERROR */}
        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800/50 dark:bg-red-950/40 dark:text-red-300">
            <span className="material-symbols-outlined mt-0.5 shrink-0" style={{ fontSize: 20 }}>error</span>
            <div className="flex-1">
              <p className="font-semibold">Unable to analyze image</p>
              <p className="mt-1 text-sm">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => setError("")}
              className="rounded-lg p-1 text-red-500 transition hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/40"
              aria-label="Dismiss error"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
            </button>
          </div>
        )}

        {/* =====================================================
            CAPTURE SURFACE
        ===================================================== */}
        <section className="rounded-3xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-7">

          {!previewUrl ? (
            <>
              {/* ---------- DROP ZONE (single-card design) ---------- */}
              <div
                onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
                onDrop={handleDrop}
                className={`rounded-2xl border-2 border-dashed p-8 text-center transition sm:p-12 ${
                  dragging
                    ? "border-emerald-400 bg-emerald-50/70 dark:border-emerald-500/70 dark:bg-emerald-900/20"
                    : "border-emerald-200/70 bg-surface-muted dark:border-emerald-800/50"
                }`}
              >
                <input
                  id="image-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100/80 text-brand-600 dark:bg-emerald-900/40 dark:text-emerald-300">
                  <span className="material-symbols-outlined" style={{ fontSize: 30 }}>cloud_upload</span>
                </div>

                <div className="mt-5 flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1">
                  <h3 className="text-[17px] font-bold text-ink sm:text-lg">
                    Drop a leaf image here
                  </h3>
                  <p className="text-[13px] text-muted">
                    JPG, PNG or WEBP, up to 10 MB
                  </p>
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <label
                    htmlFor="image-upload"
                    className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full bg-brand-700 px-6 py-3 text-[14px] font-semibold text-white shadow-sm transition hover:bg-brand-800"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 19 }}>upload</span>
                    Choose image
                  </label>

                  <button
                    type="button"
                    onClick={() => openCamera()}
                    disabled={cameraLoading || loading}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-line bg-surface px-6 py-3 text-[14px] font-semibold text-ink shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50/60 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/30"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 19 }}>photo_camera</span>
                    {cameraLoading ? "Opening Camera…" : "Use camera"}
                  </button>
                </div>
              </div>

              {/* CAMERA ERROR */}
              {cameraError && (
                <div className="mt-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950/40 dark:text-red-300">
                  <span className="material-symbols-outlined mt-0.5 shrink-0" style={{ fontSize: 20 }}>videocam_off</span>
                  <div className="flex-1">
                    <p className="font-semibold">Camera Error</p>
                    <p className="mt-1">{cameraError}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openCamera()}
                        disabled={cameraLoading}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
                        Try Again
                      </button>
                      <button
                        type="button"
                        onClick={() => setCameraError("")}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-surface px-3 py-1.5 text-[12px] font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-800/50 dark:bg-transparent dark:text-red-400 dark:hover:bg-red-950/40"
                      >
                        Dismiss
                      </button>
                      <label
                        htmlFor="image-upload"
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-red-200 bg-surface px-3 py-1.5 text-[12px] font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-800/50 dark:bg-transparent dark:text-red-400 dark:hover:bg-red-950/40"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>upload_file</span>
                        Upload Image Instead
                      </label>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCameraError("")}
                    className="rounded-lg p-1 text-red-400 transition hover:bg-red-100 dark:hover:bg-red-900/40"
                    aria-label="Dismiss camera error"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
                  </button>
                </div>
              )}

            </>
          ) : (
            /* ---------- IMAGE PREVIEW ---------- */
            <div className="overflow-hidden rounded-2xl border border-line">
              <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-brand-600" style={{ fontSize: 18 }}>image</span>
                  <p className="text-[14px] font-bold text-ink">Image Preview</p>
                </div>
                {selectedFile && (
                  <p className="text-[12px] text-muted">
                    {selectedFile.name} • {formatBytes(selectedFile.size)}
                  </p>
                )}
              </div>

              <div className="relative flex min-h-[240px] items-center justify-center bg-surface-muted">
                <img
                  src={previewUrl}
                  alt="Selected wheat leaf"
                  className="max-h-[420px] w-full object-contain"
                />
              </div>

              <div className="flex flex-col gap-3 border-t border-line bg-surface px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={loading}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-[13px] font-semibold text-ink transition hover:bg-surface-muted disabled:opacity-50"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>restart_alt</span>
                  Change Image
                </button>

                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={!selectedFile || loading}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-[14px] font-bold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{loading ? "progress_activity" : "biotech"}</span>
                  {loading ? "Analyzing…" : "Predict Disease"}
                </button>
              </div>
            </div>
          )}

          {/* ---------- LOADING ---------- */}
          {loading && (
            <div className="mt-6 flex items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-800/50 dark:bg-emerald-950/40">
              <span className="material-symbols-outlined animate-spin text-brand-600 dark:text-emerald-300" style={{ fontSize: 30 }}>
                progress_activity
              </span>
              <div className="flex-1">
                <p className="text-[14px] font-bold text-emerald-900 dark:text-emerald-100">Analyzing Wheat Leaf…</p>
                <p className="mt-0.5 text-[13px] text-emerald-700 dark:text-emerald-300">
                  WheatGuard is analyzing your image. Please wait…
                </p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-900/60">
                  <div
                    className="h-full rounded-full bg-brand-600 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
              <span className="text-[13px] font-bold text-emerald-700 dark:text-emerald-300">{progress}%</span>
            </div>
          )}

          {/* ---------- INLINE RESULT (open result automatically = off) ---------- */}
          {!loading && inlineResult && (
            <div className="mt-6 overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50/60 dark:border-emerald-800/50 dark:bg-emerald-950/30">
              <div className="flex items-center justify-between border-b border-emerald-200 bg-surface px-4 py-3 dark:border-emerald-800/50">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-brand-600" style={{ fontSize: 18 }}>verified</span>
                  <p className="text-[14px] font-bold text-ink">Analysis Complete</p>
                </div>
                <p className="text-[12px] text-muted">
                  {inlineResult.confidence_percentage.toFixed(1)}% confidence
                </p>
              </div>
              <div className="p-4">
                <p className="text-[15px] font-bold text-brand-900 dark:text-brand-100">{inlineResult.prediction}</p>
                <p className="mt-1 line-clamp-2 text-[13px] text-muted">
                  {inlineResult.disease_info?.description || inlineResult.recommendation}
                </p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => router.push("/dashboard/detection/result")}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-[13px] font-bold text-white shadow-sm transition hover:bg-brand-700"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>monitoring</span>
                    View Full Result
                  </button>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-5 py-2.5 text-[13px] font-semibold text-ink transition hover:bg-surface-muted"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>restart_alt</span>
                    Analyze Another
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* =====================================================
            TIPS
        ===================================================== */}
        <section className="mt-6 rounded-3xl border border-line bg-surface p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <h2 className="text-[15px] font-bold text-brand-900 dark:text-brand-100">Tips for better results</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <HintRow icon="check_circle" text="Place one wheat leaf inside the frame" />
            <HintRow icon="check_circle" text="Use good natural lighting" />
            <HintRow icon="check_circle" text="Keep the leaf in focus" />
            <HintRow icon="check_circle" text="Avoid heavy shadows" />
          </div>
        </section>
      </div>

      {/* =====================================================
          CAMERA MODAL (full-screen)
      ===================================================== */}

      {/* Portaled to <body> so `fixed inset-0` resolves against the viewport
          instead of any transformed/overflow-hidden ancestor in the dashboard
          layout — otherwise the camera renders as a small centered box on
          mobile. Only shown after a user gesture (post-mount), so SSR-safe. */}
      {cameraOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[100] bg-black">
          <div className="relative flex h-full flex-col">

            {/* HEADER */}
            <div className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent px-4 pb-8 pt-5 text-white sm:px-6">
              <div>
                <h2 className="text-lg font-bold">Camera</h2>
                <p className="text-xs text-white/70">Position the leaf inside the frame</p>
              </div>
              <button
                type="button"
                onClick={stopCamera}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 backdrop-blur transition hover:bg-white/25"
                aria-label="Close camera"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 22 }}>close</span>
              </button>
            </div>

            {/* VIDEO — fills the whole screen on mobile (object-cover) for a
                true full-bleed camera; letterboxed (object-contain) on larger
                screens to show the complete frame. Capture always uses the raw
                video.videoWidth/Height, so this visual crop never affects the
                analysed image. */}
            <div className="relative flex-1 overflow-hidden bg-black">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`absolute inset-0 h-full w-full bg-black object-cover sm:object-contain ${cameraFacingMode === "user" ? "scale-x-[-1]" : ""}`}
              />

              {/* LEAF GUIDE — centred in the safe area between the header and
                  controls; portrait framing on phones, landscape on larger. */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8 pb-44 pt-24">
                <div className="relative aspect-[3/4] w-full max-w-[340px] sm:aspect-[4/3] sm:max-w-[460px]">
                  <div className="absolute inset-0 rounded-2xl border-2 border-white/50">
                    <span className="absolute left-0 top-0 h-8 w-8 rounded-tl-xl border-l-4 border-t-4 border-emerald-400" />
                    <span className="absolute right-0 top-0 h-8 w-8 rounded-tr-xl border-r-4 border-t-4 border-emerald-400" />
                    <span className="absolute bottom-0 left-0 h-8 w-8 rounded-bl-xl border-b-4 border-l-4 border-emerald-400" />
                    <span className="absolute bottom-0 right-0 h-8 w-8 rounded-br-xl border-b-4 border-r-4 border-emerald-400" />
                  </div>
                  <div className="absolute inset-x-0 -top-2 flex justify-center">
                    <span className="rounded-full bg-black/55 px-3.5 py-1.5 text-[11px] font-semibold text-white backdrop-blur">
                      Keep the wheat leaf inside the frame
                    </span>
                  </div>
                </div>
              </div>

              {cameraLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                  <div className="text-center text-white">
                    <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-white" />
                    <p className="mt-4 text-sm font-semibold">Starting camera...</p>
                  </div>
                </div>
              )}
            </div>

            {/* CONTROLS */}
            <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-5 pb-8 pt-16 text-white">
              <div className="mx-auto flex max-w-md items-center justify-center gap-8">
                <button
                  type="button"
                  onClick={switchCamera}
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 backdrop-blur transition hover:bg-white/25"
                  aria-label="Switch camera"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 24 }}>flip_camera_android</span>
                </button>

                <button
                  type="button"
                  onClick={capturePhoto}
                  disabled={cameraLoading}
                  className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-white/20 shadow-xl backdrop-blur transition hover:scale-105 disabled:opacity-50"
                  aria-label="Capture photo"
                >
                  <span className="h-14 w-14 rounded-full bg-white" />
                </button>

                <button
                  type="button"
                  onClick={stopCamera}
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 backdrop-blur transition hover:bg-white/25"
                  aria-label="Close camera"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 24 }}>close</span>
                </button>
              </div>

              <div className="mx-auto mt-5 flex max-w-md flex-wrap items-center justify-center gap-x-5 gap-y-1 text-center text-[11px] text-white/70">
                <span>✓ One leaf in frame</span>
                <span>✓ Good lighting</span>
                <span>✓ Keep in focus</span>
                <span>✓ Avoid shadows</span>
              </div>
            </div>

            <canvas ref={canvasRef} className="hidden" />
          </div>
        </div>,
          document.body
        )}

    </main>
  );
}
