"use client";

import { useState, useRef, useCallback } from "react";
import { useApp } from "@/lib/appState";
import { predictImage } from "@/lib/api";

type CameraState = "idle" | "live" | "captured" | "analysing";

export function CameraView() {
  const { setUserTab, setLastResult } = useApp();

  const [camState,   setCamState]   = useState<CameraState>("idle");
  const [capturedSrc,setCapturedSrc]= useState<string | null>(null);
  const [capturedFile,setCapturedFile]=useState<File | null>(null);
  const [flashOn,    setFlashOn]    = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [error,      setError]      = useState("");
  const [progress,   setProgress]   = useState(0);

  const videoRef   = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const streamRef  = useRef<MediaStream | null>(null);

  // ── Start live camera ──────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setError("");
    try {
      // Stop any existing stream first
      streamRef.current?.getTracks().forEach(t => t.stop());

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCamState("live");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Camera access denied";
      setError(`Camera error: ${msg}. Please allow camera access in your browser.`);
    }
  }, [facingMode]);

  // ── Stop camera ────────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // ── Capture photo from video ───────────────────────────────────────────────
  const capturePhoto = useCallback(() => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width  = video.videoWidth  || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert canvas to blob → File
    canvas.toBlob(blob => {
      if (!blob) { setError("Failed to capture photo."); return; }
      const url  = URL.createObjectURL(blob);
      const file = new File([blob], `capture_${Date.now()}.jpg`, { type: "image/jpeg" });
      setCapturedSrc(url);
      setCapturedFile(file);
      stopCamera();
      setCamState("captured");
    }, "image/jpeg", 0.92);
  }, [stopCamera]);

  // ── Retake ─────────────────────────────────────────────────────────────────
  const retake = () => {
    if (capturedSrc) URL.revokeObjectURL(capturedSrc);
    setCapturedSrc(null);
    setCapturedFile(null);
    startCamera();
  };

  // ── Flip camera ────────────────────────────────────────────────────────────
  const flipCamera = () => {
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    if (camState === "live") {
      stopCamera();
      setTimeout(() => startCamera(), 200);
    }
  };

  // ── Run prediction on captured image ──────────────────────────────────────
  const analyseCapture = async () => {
    if (!capturedFile) return;
    setCamState("analysing");
    setProgress(0);
    setError("");
    try {
      const result = await predictImage(capturedFile, {
        includeGradcam: true,
        topK: 5,
        onProgress: setProgress,
      });
      setLastResult(result, capturedSrc ?? undefined);
      stopCamera();
      setUserTab("result");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Analysis failed";
      setError(msg);
      setCamState("captured");
    } finally {
      setProgress(0);
    }
  };

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  // (handled by stopCamera in retake / capture flow)

  const isAnalysing = camState === "analysing";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-4xl mx-auto p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[32px] font-bold text-brand-900">Field Camera Reticle</h2>
          <p className="text-[14px] text-muted mt-1">
            Align a single wheat leaf along the alignment guides for optimal ML bounding accuracy.
          </p>
        </div>
        <button
          onClick={() => { stopCamera(); setUserTab("detection"); }}
          className="text-[13px] text-brand-700 hover:underline flex items-center gap-1"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>arrow_back</span>
          Switch to File Upload
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-danger-soft border border-danger/40 text-[13px] text-danger flex items-start gap-2">
          <span className="material-symbols-outlined shrink-0" style={{ fontSize: 16 }}>error</span>
          {error}
        </div>
      )}

      {/* Camera viewport */}
      <div className="bg-black rounded-2xl overflow-hidden relative shadow-lg border border-line"
        style={{ aspectRatio: "16/9" }}>

        {/* ── IDLE: start prompt ── */}
        {camState === "idle" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <span className="material-symbols-outlined text-white/60" style={{ fontSize: 64 }}>photo_camera</span>
            <button
              onClick={startCamera}
              className="px-6 py-3 rounded-xl bg-brand-800 text-white text-[16px] font-semibold hover:bg-brand-700 transition-all shadow-lg flex items-center gap-2"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>videocam</span>
              Start Camera
            </button>
            <p className="text-white/50 text-[12px]">Browser will ask for camera permission</p>
          </div>
        )}

        {/* ── LIVE: video feed ── */}
        {camState === "live" && (
          <>
            <video
              ref={videoRef}
              autoPlay playsInline muted
              className="absolute inset-0 w-full h-full object-cover"
              style={{ opacity: 0.92 }}
            />

            {/* Reticle overlay */}
            <div className="absolute inset-8 sm:inset-12 border-2 border-brand-700/70 rounded-xl pointer-events-none flex flex-col justify-between p-3">
              <div className="flex justify-between items-start">
                <span className="px-2 py-0.5 rounded bg-black/60 text-white font-mono text-xs">
                  {facingMode === "environment" ? "REAR" : "FRONT"} • AUTO
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-brand-700 text-white text-xs font-bold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-surface animate-ping" />
                  ALIGNED
                </span>
              </div>
              <div className="text-center">
                <span className="inline-block px-3 py-1 rounded-full bg-black/70 text-white text-xs backdrop-blur-sm">
                  Hold still • Stabilising foliar leaf boundary
                </span>
              </div>
              <div className="flex justify-between text-xs text-white/70 font-mono">
                <span>FOV: 84° Standard</span>
                <span>FOCUS: AUTO MACRO</span>
              </div>
            </div>

            {/* Controls */}
            <div className="absolute bottom-5 left-0 right-0 flex items-center justify-center gap-8 z-30">
              <button
                onClick={() => setFlashOn(f => !f)}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                  flashOn ? "bg-yellow-400 text-black" : "bg-black/60 text-white hover:bg-black/80"
                }`}
                title="Toggle flash (visual only)"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                  {flashOn ? "flash_on" : "flash_off"}
                </span>
              </button>

              {/* Shutter */}
              <button
                onClick={capturePhoto}
                className="w-16 h-16 rounded-full bg-surface p-1.5 shadow-lg active:scale-95 transition-transform flex items-center justify-center"
                title="Capture photo"
              >
                <div className="w-full h-full rounded-full border-2 border-black bg-surface hover:bg-brand-50 transition-colors" />
              </button>

              <button
                onClick={flipCamera}
                className="w-10 h-10 rounded-full bg-black/60 text-white hover:bg-black/80 flex items-center justify-center transition-colors"
                title="Flip camera"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>flip_camera_android</span>
              </button>
            </div>
          </>
        )}

        {/* ── CAPTURED / ANALYSING: show still ── */}
        {(camState === "captured" || camState === "analysing") && capturedSrc && (
          <>
            <img src={capturedSrc} alt="Captured leaf" className="absolute inset-0 w-full h-full object-cover" />

            {/* Scanning laser overlay during analysis */}
            {isAnalysing && (
              <div className="absolute left-0 right-0 h-1 bg-brand-700 shadow-[0_0_14px_#10B981] scanning-line z-20" />
            )}

            {/* Caption bar */}
            <div className="absolute top-3 left-0 right-0 flex justify-center">
              <span className="px-3 py-1 rounded-full bg-black/70 text-white text-[12px] backdrop-blur-sm font-semibold">
                {isAnalysing ? "Analysing with WheatGuard Vision AI…" : "Photo captured — ready for analysis"}
              </span>
            </div>

            {/* Upload progress during analysis */}
            {isAnalysing && progress > 0 && progress < 100 && (
              <div className="absolute bottom-20 left-8 right-8">
                <div className="w-full h-2 rounded-full bg-black/40 overflow-hidden">
                  <div
                    className="h-full bg-brand-700 rounded-full transition-all duration-200"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-white text-xs text-center mt-1">Uploading {progress}%</p>
              </div>
            )}

            {/* Action buttons */}
            {!isAnalysing && (
              <div className="absolute bottom-5 left-0 right-0 flex items-center justify-center gap-4 z-30">
                <button
                  onClick={retake}
                  className="px-5 py-2.5 rounded-xl border-2 border-white text-white hover:bg-white/20 font-semibold text-[14px] transition-all backdrop-blur-sm"
                >
                  Retake
                </button>
                <button
                  onClick={analyseCapture}
                  className="px-6 py-2.5 rounded-xl bg-brand-700 text-white font-semibold text-[14px] hover:bg-brand-800 transition-all shadow-lg flex items-center gap-2"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>psychology</span>
                  Analyse Leaf with AI
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Instructions */}
      <div className="bg-surface rounded-xl border border-line p-5 shadow-sm">
        <h3 className="text-[14px] font-semibold text-brand-900 mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-brand-700" style={{ fontSize: 18 }}>tips_and_updates</span>
          Capture Best Practices
        </h3>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12px] text-muted">
          {[
            "Position the wheat leaf fully in the reticle frame",
            "Ensure good natural lighting – avoid harsh shadows",
            "Keep the leaf flat and parallel to the camera",
            "Fill at least 70% of the frame with leaf tissue",
            "Hold the device steady to avoid motion blur",
            "Use the rear camera for highest resolution capture",
          ].map(tip => (
            <li key={tip} className="flex items-start gap-2">
              <span className="material-symbols-outlined text-brand-700 shrink-0 mt-0.5" style={{ fontSize: 14 }}>
                check_circle
              </span>
              {tip}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
