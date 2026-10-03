"use client";

/**
 * DiagnosticView — merged Leaf Diagnosis + Camera Capture
 *
 * Two tabs inside one view:
 *   "Upload File"   — drag-and-drop / file browser (was DetectionView)
 *   "Camera"        — live camera capture with reticle (was CameraView)
 *
 * Both tabs share the same "Analyze Leaf with AI" pipeline and navigate
 * to ResultView on success. The active tab can be controlled externally
 * via the `defaultTab` prop so the Dashboard "Upload Leaf" and "Open Reticle"
 * buttons land on the correct tab.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/appState";
import { predictImage } from "@/lib/api";

type InputTab   = "upload" | "camera";
type CameraState = "idle" | "live" | "captured" | "analysing";

interface DiagnosticViewProps {
  /** Which tab to show on mount. Sidebar "Leaf Diagnosis" → upload,
   *  Dashboard "Open Reticle" → camera. Defaults to "upload". */
  defaultTab?: InputTab;
}

// ── Demo placeholder image ────────────────────────────────────────────────────
const DEMO_IMG =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuDP9UlJJozqGQcUYy8lsJtf5-z10w9Gzr-yAboJcf-Kj1WFcvaO_6fvYM8qPGwP6Um1CCgNEeLYg9WjhtflVuKJsXm8K9TJFUFIzWTr2wSUq5jbg99VKS7QGr_lR01RpVUXoqSeo3k--xJ17d2KAl8p61WpEB4wSrys4F8i-d3UHcWpHzGnh2X2dfe7K00VpNkiYowYG9udiqcUjMNF5shAOpCDdALM7pn5TFIFaKQXb5niWl-V-XOH9g";

// ─────────────────────────────────────────────────────────────────────────────

export function DiagnosticView({ defaultTab = "upload" }: DiagnosticViewProps) {
  const { setLastResult } = useApp();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<InputTab>(defaultTab);

  // Reset to defaultTab whenever the parent changes it (e.g. different dashboard button)
  useEffect(() => { setActiveTab(defaultTab); }, [defaultTab]);

  // ── Shared state ──────────────────────────────────────────────────────────
  const [scanning,  setScanning]  = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [error,     setError]     = useState("");

  // ── Upload-tab state ──────────────────────────────────────────────────────
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewSrc,   setPreviewSrc]   = useState(DEMO_IMG);
  const [filename,     setFilename]     = useState("SPECIMEN_FLAG_LEAF_042.JPG");
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Camera-tab state ──────────────────────────────────────────────────────
  const [camState,    setCamState]    = useState<CameraState>("idle");
  const [capturedSrc, setCapturedSrc] = useState<string | null>(null);
  const [capturedFile,setCapturedFile]= useState<File | null>(null);
  const [flashOn,     setFlashOn]     = useState(false);
  const [facingMode,  setFacingMode]  = useState<"environment" | "user">("environment");
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // ── Tab switch — stop camera when leaving camera tab ──────────────────────
  const switchTab = (tab: InputTab) => {
    if (tab === "upload" && camState === "live") stopCamera();
    setActiveTab(tab);
    setError("");
  };

  // ══════════════════════════════════════════════════════════════════════════
  // UPLOAD TAB LOGIC
  // ══════════════════════════════════════════════════════════════════════════

  const handleFile = (f: File) => {
    setSelectedFile(f);
    setFilename(f.name);
    if (previewSrc.startsWith("blob:")) URL.revokeObjectURL(previewSrc);
    setPreviewSrc(URL.createObjectURL(f));
    setError("");
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const handleDiscard = () => {
    if (previewSrc.startsWith("blob:")) URL.revokeObjectURL(previewSrc);
    setSelectedFile(null);
    setFilename("SPECIMEN_FLAG_LEAF_042.JPG");
    setPreviewSrc(DEMO_IMG);
    setError("");
  };

  const runUploadScan = async () => {
    if (!selectedFile) {
      // Demo mode
      setScanning(true);
      setLastResult(null, previewSrc);
      setTimeout(() => { setScanning(false); router.push("/dashboard/result"); }, 1400);
      return;
    }
    await runPrediction(selectedFile, previewSrc);
  };

  // ══════════════════════════════════════════════════════════════════════════
  // CAMERA TAB LOGIC
  // ══════════════════════════════════════════════════════════════════════════

  const startCamera = useCallback(async () => {
    setError("");
    try {
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

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const capturePhoto = useCallback(() => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width  = video.videoWidth  || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
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

  const retake = () => {
    if (capturedSrc) URL.revokeObjectURL(capturedSrc);
    setCapturedSrc(null);
    setCapturedFile(null);
    startCamera();
  };

  const flipCamera = () => {
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    if (camState === "live") {
      stopCamera();
      setTimeout(() => startCamera(), 200);
    }
  };

  const runCameraScan = async () => {
    if (!capturedFile || !capturedSrc) return;
    setCamState("analysing");
    await runPrediction(capturedFile, capturedSrc, () => setCamState("captured"));
  };

  // ══════════════════════════════════════════════════════════════════════════
  // SHARED PREDICTION RUNNER
  // ══════════════════════════════════════════════════════════════════════════

  const runPrediction = async (file: File, imageSrc: string, onFail?: () => void) => {
    setScanning(true);
    setProgress(0);
    setError("");
    try {
      const result = await predictImage(file, {
        includeGradcam: true,
        topK: 5,
        onProgress: setProgress,
      });
      setLastResult(result, imageSrc);
      stopCamera();
      router.push("/dashboard/result");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Prediction failed. Is the backend running?";
      setError(msg);
      onFail?.();
    } finally {
      setScanning(false);
      setProgress(0);
    }
  };

  const isAnalysing = camState === "analysing";

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-6 lg:p-8">

      <div className="flex items-center bg-surface p-1 rounded-xl border border-line w-fit gap-1 shadow-sm">
        <button
          onClick={() => switchTab("upload")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold transition-all ${
            activeTab === "upload"
              ? "bg-brand-900 text-white shadow-sm"
              : "text-muted hover:text-brand-900"
          }`}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>cloud_upload</span>
          Upload Image
        </button>
        <button
          onClick={() => switchTab("camera")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold transition-all ${
            activeTab === "camera"
              ? "bg-brand-900 text-white shadow-sm"
              : "text-muted hover:text-brand-900"
          }`}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>photo_camera</span>
          Camera
        </button>
      </div>

      {/* ── Error banner (shared) ── */}
      {error && (
        <div className="p-3 rounded-lg bg-danger-soft border border-danger text-xs text-danger flex items-center gap-2">
          <span className="material-symbols-outlined shrink-0" style={{ fontSize: 16 }}>error</span>
          {error}
          <button onClick={() => setError("")} className="ml-auto text-xs hover:underline shrink-0">Dismiss</button>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          UPLOAD TAB
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "upload" && (
        <div className="space-y-6">
          <div
            className="bg-surface rounded-2xl border-2 border-dashed border-line p-10 text-center hover:border-brand-600 transition-all cursor-pointer shadow-sm"
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef} type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleInput}
            />
            <div className="max-w-md mx-auto space-y-4">
              <div className="w-16 h-16 rounded-full bg-brand-50 dark:bg-brand-900/40 text-brand-900 mx-auto flex items-center justify-center">
                <span className="material-symbols-outlined" style={{ fontSize: 34 }}>cloud_upload</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-ink">Drag & drop an image here</h3>
                <p className="text-xs text-muted mt-1">JPG, PNG, or WEBP up to 10 MB</p>
              </div>
              {selectedFile && (
                <div className="mx-auto w-40 space-y-1.5">
                  <div className="w-40 h-28 rounded-xl overflow-hidden border border-line">
                    <img src={previewSrc} alt="Preview" className="w-full h-full object-cover" />
                  </div>
                  <p className="text-xs text-muted truncate" title={filename}>{filename}</p>
                </div>
              )}
              <div onClick={e => e.stopPropagation()} className="flex flex-col items-center gap-3">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="px-6 py-2.5 rounded-xl bg-brand-900 text-white text-sm font-semibold hover:bg-brand-950 transition-all"
                >
                  Choose Image
                </button>
                {scanning && (
                  <div className="w-full max-w-xs">
                    <div className="flex justify-between text-xs text-muted mb-1">
                      <span>Analyzing…</span><span>{progress}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-line overflow-hidden">
                      <div className="h-full bg-brand-600 rounded-full transition-all" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                )}
                <button
                  onClick={runUploadScan}
                  disabled={scanning}
                  className="px-6 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-all disabled:opacity-60"
                >
                  {scanning ? "Processing…" : "Analyze Leaf with AI"}
                </button>
                {selectedFile && (
                  <button
                    onClick={handleDiscard}
                    disabled={scanning}
                    className="text-xs text-muted hover:text-danger"
                  >
                    Clear image
                  </button>
                )}
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-brand-900 mb-3">Example Images</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { name: "Leaf Rust", img: "https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=400&h=300&fit=crop" },
                { name: "Stripe Rust", img: "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=400&h=300&fit=crop" },
                { name: "Septoria Tritici", img: "https://images.unsplash.com/photo-1592921464583-bb1b8b93492c?w=400&h=300&fit=crop" },
                { name: "Healthy Leaf", img: "https://images.unsplash.com/photo-1500937386664-56d1dfef3854?w=400&h=300&fit=crop" },
              ].map(ex => (
                <div key={ex.name} className="bg-surface rounded-xl overflow-hidden border border-line shadow-sm">
                  <div className="h-24 bg-surface-muted">
                    <img src={ex.img} alt={ex.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="px-2 py-2 text-center text-xs font-medium text-ink">{ex.name}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          CAMERA TAB
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "camera" && (
        <div className="space-y-5">

          {/* Camera viewport */}
          <div
            className="bg-black rounded-2xl overflow-hidden relative shadow-lg border border-line"
            style={{ aspectRatio: "16/9" }}
          >
            {/* IDLE */}
            {camState === "idle" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                <span className="material-symbols-outlined text-white/50" style={{ fontSize: 64 }}>photo_camera</span>
                <button
                  onClick={startCamera}
                  className="px-6 py-3 rounded-xl bg-brand-800 text-white text-base font-semibold hover:bg-brand-700 transition-all shadow-lg flex items-center gap-2"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>videocam</span>
                  Start Camera
                </button>
                <p className="text-white/40 text-xs">Browser will request camera permission</p>
              </div>
            )}

            {/* LIVE */}
            {camState === "live" && (
              <>
                <video
                  ref={videoRef}
                  autoPlay playsInline muted
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{ opacity: 0.92 }}
                />

                {/* Reticle */}
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
                    onClick={() => setFlashOn(v => !v)}
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                      flashOn ? "bg-yellow-400 text-black" : "bg-black/60 text-white hover:bg-black/80"
                    }`}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                      {flashOn ? "flash_on" : "flash_off"}
                    </span>
                  </button>
                  <button
                    onClick={capturePhoto}
                    className="w-16 h-16 rounded-full bg-surface p-1.5 shadow-lg active:scale-95 transition-transform flex items-center justify-center"
                  >
                    <div className="w-full h-full rounded-full border-2 border-black bg-surface hover:bg-[#eaedff] transition-colors" />
                  </button>
                  <button
                    onClick={flipCamera}
                    className="w-10 h-10 rounded-full bg-black/60 text-white hover:bg-black/80 flex items-center justify-center transition-colors"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>flip_camera_android</span>
                  </button>
                </div>
              </>
            )}

            {/* CAPTURED / ANALYSING */}
            {(camState === "captured" || isAnalysing) && capturedSrc && (
              <>
                <img src={capturedSrc} alt="Captured leaf" className="absolute inset-0 w-full h-full object-cover" />

                {/* Scan laser during analysis */}
                {isAnalysing && (
                  <div className="absolute left-0 right-0 h-1 bg-brand-700 shadow-[0_0_14px_#10B981] scanning-line z-20" />
                )}

                {/* Status label */}
                <div className="absolute top-3 left-0 right-0 flex justify-center z-30">
                  <span className="px-3 py-1 rounded-full bg-black/70 text-white text-xs backdrop-blur-sm font-semibold">
                    {isAnalysing ? "Analysing with WheatGuard Vision AI…" : "Photo captured — ready for analysis"}
                  </span>
                </div>

                {/* Upload progress */}
                {isAnalysing && progress > 0 && progress < 100 && (
                  <div className="absolute bottom-20 left-8 right-8 z-30">
                    <div className="w-full h-2 rounded-full bg-black/40 overflow-hidden">
                      <div className="h-full bg-brand-700 rounded-full transition-all" style={{ width: `${progress}%` }} />
                    </div>
                    <p className="text-white text-xs text-center mt-1">Uploading {progress}%</p>
                  </div>
                )}

                {/* Retake / Analyse buttons */}
                {!isAnalysing && (
                  <div className="absolute bottom-5 left-0 right-0 flex items-center justify-center gap-4 z-30">
                    <button
                      onClick={retake}
                      className="px-5 py-2.5 rounded-xl border-2 border-white text-white hover:bg-white/20 font-semibold text-sm transition-all backdrop-blur-sm"
                    >
                      Retake
                    </button>
                    <button
                      onClick={runCameraScan}
                      className="px-6 py-2.5 rounded-xl bg-brand-700 text-white font-semibold text-sm hover:bg-brand-800 transition-all shadow-lg flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>psychology</span>
                      Analyse Leaf with AI
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Hidden canvas */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Capture tips */}
          <div className="bg-surface rounded-xl border border-line p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-brand-900 mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-brand-700" style={{ fontSize: 18 }}>tips_and_updates</span>
              Capture Best Practices
            </h3>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted">
              {[
                "Position wheat leaf fully inside the reticle frame",
                "Use good natural lighting — avoid harsh shadows",
                "Keep the leaf flat and parallel to the camera",
                "Fill at least 70% of frame with leaf tissue",
                "Hold steady to avoid motion blur",
                "Use rear camera for highest resolution",
              ].map(tip => (
                <li key={tip} className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-brand-700 shrink-0 mt-0.5" style={{ fontSize: 13 }}>check_circle</span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
