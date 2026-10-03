"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Camera,
  CheckCircle,
  FileImage,
  FlipHorizontal,
  RefreshCw,
  Upload,
  VideoOff,
  X,
} from "lucide-react";
import Image from "next/image";
import { cn, formatFileSize, isAllowedImage, isWithinSizeLimit } from "@/lib/utils";

interface ImageUploaderProps {
  onFileSelected: (file: File | null) => void;
  disabled?: boolean;
  selectedFile?: File | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export function ImageUploader({ onFileSelected, disabled, selectedFile }: ImageUploaderProps) {
  const [preview, setPreview]         = useState<string | null>(null);
  const [dragOver, setDragOver]       = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [cameraOpen, setCameraOpen]   = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // ── File validation & selection ──────────────────────────────────────────
  const handleFile = useCallback(
    (file: File) => {
      setError(null);
      if (!isAllowedImage(file)) {
        setError("Unsupported format. Please upload a JPG, PNG, or WebP image.");
        onFileSelected(null);
        return;
      }
      if (!isWithinSizeLimit(file)) {
        setError("File is too large. Maximum size is 10 MB.");
        onFileSelected(null);
        return;
      }
      if (file.size === 0) {
        setError("The selected file appears to be empty.");
        onFileSelected(null);
        return;
      }
      const url = URL.createObjectURL(file);
      setPreview(url);
      onFileSelected(file);
    },
    [onFileSelected]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      if (disabled) return;
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [disabled, handleFile]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const clear = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setError(null);
    onFileSelected(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  // ── Camera capture callback ──────────────────────────────────────────────
  const handleCaptured = (file: File) => {
    setCameraOpen(false);
    handleFile(file);
  };

  const hasFile = !!preview && !!selectedFile;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">

      {/* ── Upload / drag-drop zone ── */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Upload wheat leaf image"
        aria-disabled={disabled}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !disabled) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDragEnd={() => setDragOver(false)}
        className={cn(
          "relative flex min-h-52 cursor-pointer flex-col items-center justify-center",
          "rounded-xl border-2 border-dashed outline-none transition-all duration-200",
          "focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2",
          dragOver
            ? "scale-[1.01] border-green-400 bg-green-50 dark:border-green-500 dark:bg-green-950/30"
            : hasFile
            ? "border-solid border-green-400 bg-green-50/50 dark:border-green-700 dark:bg-green-950/20"
            : "border-gray-300 bg-gray-50 hover:border-green-400 hover:bg-green-50/50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-green-700 dark:hover:bg-green-950/20",
          disabled && "pointer-events-none cursor-not-allowed opacity-60"
        )}
      >
        {hasFile ? (
          <>
            <div className="relative h-48 w-full overflow-hidden rounded-lg">
              <Image
                src={preview!}
                alt="Selected wheat leaf"
                fill
                className="object-contain p-2"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
            </div>
            {!disabled && (
              <button
                type="button"
                aria-label="Remove selected image"
                onClick={(e) => { e.stopPropagation(); clear(); }}
                className="absolute right-2 top-2 rounded-full bg-white p-1.5 shadow-md transition hover:bg-red-50 dark:bg-zinc-800 dark:hover:bg-red-950/40"
              >
                <X className="h-3.5 w-3.5 text-red-500" />
              </button>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <div className={cn(
              "rounded-full p-4 transition-colors",
              dragOver ? "bg-green-100 dark:bg-green-900/40" : "bg-gray-100 dark:bg-zinc-800"
            )}>
              {dragOver
                ? <FileImage className="h-7 w-7 text-green-600 dark:text-green-400" />
                : <Upload className="h-7 w-7 text-gray-400 dark:text-zinc-500" />
              }
            </div>
            <div>
              <p className="font-semibold text-gray-700 dark:text-zinc-200">
                {dragOver ? "Drop your image here" : "Upload Wheat Leaf Image"}
              </p>
              <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">
                Drag & drop or{" "}
                <span className="text-green-600 underline underline-offset-2 dark:text-green-400">
                  click to browse
                </span>
              </p>
              <p className="mt-2 text-xs text-gray-400 dark:text-zinc-500">
                JPG, JPEG, PNG, WebP · Max 10 MB
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Camera / Upload toggle buttons (shown when no file selected) ── */}
      {!hasFile && !disabled && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-medium text-gray-600 transition hover:border-green-300 hover:bg-green-50 hover:text-green-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-green-700 dark:hover:bg-green-950/30 dark:hover:text-green-400"
          >
            <Upload className="h-4 w-4" />
            Upload File
          </button>
          <button
            type="button"
            onClick={() => setCameraOpen(true)}
            className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-medium text-gray-600 transition hover:border-green-300 hover:bg-green-50 hover:text-green-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-green-700 dark:hover:bg-green-950/30 dark:hover:text-green-400"
          >
            <Camera className="h-4 w-4" />
            Take Photo
          </button>
        </div>
      )}

      {/* ── File info bar (when file selected) ── */}
      {hasFile && selectedFile && (
        <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 dark:border-green-800 dark:bg-green-950/20">
          <div className="flex min-w-0 items-center gap-2">
            <CheckCircle className="h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-800 dark:text-zinc-100">
                {selectedFile.name}
              </p>
              <p className="text-xs text-gray-500 dark:text-zinc-400">
                {formatFileSize(selectedFile.size)}
              </p>
            </div>
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); clear(); }}
              className="ml-3 flex-shrink-0 rounded-md px-2 py-1 text-xs font-medium text-gray-500 transition hover:bg-white dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Change
            </button>
          )}
        </div>
      )}

      {/* ── Error message ── */}
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 dark:border-red-800 dark:bg-red-950/20">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* ── Best practices hint ── */}
      {!hasFile && !error && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5 dark:border-blue-900 dark:bg-blue-950/20">
          <p className="mb-1 text-xs font-semibold text-blue-700 dark:text-blue-400">
            For best results:
          </p>
          <ul className="space-y-0.5 text-xs text-blue-600 dark:text-blue-400">
            <li>• Use a clear, well-lit close-up of the wheat leaf</li>
            <li>• Make sure the leaf fills most of the frame</li>
            <li>• Avoid blurry, dark, or heavily shadowed images</li>
            <li>• Focus on the visibly affected area</li>
          </ul>
        </div>
      )}

      {/* ── Hidden file input ── */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="Choose image file"
        className="hidden"
        onChange={handleChange}
        disabled={disabled}
      />

      {/* ── Camera modal ── */}
      {cameraOpen && (
        <CameraModal
          onCapture={handleCaptured}
          onClose={() => setCameraOpen(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Camera modal — full-screen on mobile, centered on desktop
// ─────────────────────────────────────────────────────────────────────────────

type CameraState = "requesting" | "active" | "captured" | "denied" | "error";

interface CameraModalProps {
  onCapture: (file: File) => void;
  onClose: () => void;
}

function CameraModal({ onCapture, onClose }: CameraModalProps) {
  const [state, setState]           = useState<CameraState>("requesting");
  const [errorMsg, setErrorMsg]     = useState("");
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);

  const videoRef   = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const streamRef  = useRef<MediaStream | null>(null);

  // ── Start camera ──────────────────────────────────────────────────────────
  const startCamera = useCallback(async (facing: "environment" | "user") => {
    // Stop any existing stream first
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCapturedUrl(null);
    setCapturedBlob(null);
    setState("requesting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setState("active");
    } catch (err: unknown) {
      if (err instanceof Error && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")) {
        setState("denied");
      } else {
        setErrorMsg(err instanceof Error ? err.message : "Camera could not be started.");
        setState("error");
      }
    }
  }, []);

  // ── Flip camera ───────────────────────────────────────────────────────────
  const flipCamera = () => {
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    startCamera(next);
  };

  // ── Capture frame ─────────────────────────────────────────────────────────
  const capture = () => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      if (!blob) return;
      setCapturedBlob(blob);
      setCapturedUrl(canvas.toDataURL("image/jpeg", 0.92));
      setState("captured");
      // Stop live stream to save battery
      streamRef.current?.getTracks().forEach((t) => t.stop());
    }, "image/jpeg", 0.92);
  };

  // ── Retake ────────────────────────────────────────────────────────────────
  const retake = () => {
    setCapturedUrl(null);
    setCapturedBlob(null);
    startCamera(facingMode);
  };

  // ── Confirm & pass to parent ──────────────────────────────────────────────
  const confirmCapture = () => {
    if (!capturedBlob) return;
    const ts   = new Date().toISOString().replace(/[:.]/g, "-");
    const file = new File([capturedBlob], `wheat-photo-${ts}.jpg`, { type: "image/jpeg" });
    onCapture(file);
  };

  // ── Close & stop stream ───────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onClose();
  }, [onClose]);

  // ── Escape key ────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClose]);

  // ── Start on mount ────────────────────────────────────────────────────────
  useEffect(() => {
    startCamera(facingMode);
    return () => { streamRef.current?.getTracks().forEach((t) => t.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Lock body scroll ──────────────────────────────────────────────────────
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  /* ─── render ────────────────────────────────────────────────────────────── */
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Camera capture"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal panel */}
      <div className="relative z-10 flex w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-zinc-950 shadow-2xl sm:rounded-3xl sm:mx-4">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-green-400" />
            <span className="text-sm font-semibold text-white">
              {state === "captured" ? "Review Photo" : "Take Photo"}
            </span>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close camera"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-800 text-zinc-400 transition hover:bg-zinc-700 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Viewfinder / preview area ── */}
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-black">

          {/* Live video */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={cn(
              "h-full w-full object-cover",
              state !== "active" && "hidden"
            )}
          />

          {/* Captured still */}
          {state === "captured" && capturedUrl && (
            <img
              src={capturedUrl}
              alt="Captured photo"
              className="h-full w-full object-cover"
            />
          )}

          {/* Requesting / loading */}
          {state === "requesting" && (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <RefreshCw className="h-8 w-8 animate-spin text-green-400" />
              <p className="text-sm text-zinc-400">Starting camera…</p>
            </div>
          )}

          {/* Denied */}
          {state === "denied" && (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <VideoOff className="h-10 w-10 text-red-400" />
              <p className="text-sm font-semibold text-white">Camera Access Denied</p>
              <p className="text-xs text-zinc-400">
                Camera permission was not granted.<br />
                You can upload an image instead.
              </p>
            </div>
          )}

          {/* Error */}
          {state === "error" && (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <AlertCircle className="h-10 w-10 text-red-400" />
              <p className="text-sm font-semibold text-white">Camera Unavailable</p>
              <p className="text-xs text-zinc-400">{errorMsg || "Could not access the camera."}</p>
            </div>
          )}

          {/* Viewfinder overlay (guides) — only when active */}
          {state === "active" && (
            <>
              {/* Corner guide brackets */}
              {[
                "top-4 left-4 border-t-2 border-l-2 rounded-tl-lg",
                "top-4 right-4 border-t-2 border-r-2 rounded-tr-lg",
                "bottom-4 left-4 border-b-2 border-l-2 rounded-bl-lg",
                "bottom-4 right-4 border-b-2 border-r-2 rounded-br-lg",
              ].map((cls) => (
                <div key={cls} className={cn("pointer-events-none absolute h-8 w-8 border-green-400", cls)} />
              ))}
              {/* Hint text */}
              <div className="pointer-events-none absolute bottom-4 left-0 right-0 text-center">
                <span className="rounded-full bg-black/50 px-3 py-1 text-xs text-white/80">
                  Centre the wheat leaf in the frame
                </span>
              </div>
            </>
          )}

          {/* Flip camera button (top-right, only when live) */}
          {state === "active" && (
            <button
              onClick={(e) => { e.stopPropagation(); flipCamera(); }}
              aria-label="Flip camera"
              className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70"
            >
              <FlipHorizontal className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Hidden canvas for capture */}
        <canvas ref={canvasRef} className="hidden" />

        {/* ── Action buttons ── */}
        <div className="flex items-center justify-center gap-3 bg-zinc-950 px-4 py-5">

          {/* Active camera: shutter button */}
          {state === "active" && (
            <button
              onClick={capture}
              aria-label="Capture photo"
              className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white shadow-lg transition active:scale-95 hover:bg-green-50"
            >
              <div className="h-12 w-12 rounded-full bg-green-600 shadow-inner" />
            </button>
          )}

          {/* Captured: retake + use photo */}
          {state === "captured" && (
            <>
              <button
                onClick={retake}
                className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800 px-5 py-3 text-sm font-medium text-zinc-200 transition hover:bg-zinc-700"
              >
                <RefreshCw className="h-4 w-4" />
                Retake
              </button>
              <button
                onClick={confirmCapture}
                className="flex items-center gap-2 rounded-xl bg-green-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-green-700"
              >
                <CheckCircle className="h-4 w-4" />
                Use Photo
              </button>
            </>
          )}

          {/* Denied / error: upload fallback */}
          {(state === "denied" || state === "error") && (
            <button
              onClick={handleClose}
              className="rounded-xl border border-zinc-700 bg-zinc-800 px-6 py-3 text-sm font-medium text-zinc-200 transition hover:bg-zinc-700"
            >
              Close — Upload instead
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


