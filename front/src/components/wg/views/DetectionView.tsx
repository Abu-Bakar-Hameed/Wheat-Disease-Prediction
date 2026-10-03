
"use client";

import {
  ChangeEvent,
  DragEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import {
  predictImage,
  type PredictionResponse,
} from "@/lib/api";

import { Button } from "@/components/wg/ui/Button";

/* =========================================================
   TYPES
========================================================= */

type DetectionState =
  | "idle"
  | "preview"
  | "analyzing"
  | "result";

type CameraState =
  | "closed"
  | "opening"
  | "active";

/* =========================================================
   CONSTANTS
========================================================= */

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

/* =========================================================
   HELPERS
========================================================= */

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getConfidence(value: number) {
  if (value <= 1) {
    return value * 100;
  }

  return value;
}

function formatConfidence(value: number) {
  return `${getConfidence(value).toFixed(1)}%`;
}

function getSeverityClass(severity?: string) {
  const value = severity?.toLowerCase() ?? "";

  if (
    value.includes("critical") ||
    value.includes("severe") ||
    value.includes("high")
  ) {
    return "bg-danger-soft text-danger";
  }

  if (
    value.includes("moderate") ||
    value.includes("medium")
  ) {
    return "bg-amber-100 text-amber-700";
  }

  if (
    value.includes("low") ||
    value.includes("mild")
  ) {
    return "bg-blue-100 text-blue-700";
  }

  if (value.includes("healthy")) {
    return "bg-emerald-100 text-emerald-700";
  }

  return "bg-surface-muted text-ink";
}

/* =========================================================
   PAGE
========================================================= */

export default function DetectionPage() {
  const router = useRouter();

  /* -------------------------------------------------------
     REFS
  ------------------------------------------------------- */

  const fileInputRef =
    useRef<HTMLInputElement | null>(null);

  const videoRef =
    useRef<HTMLVideoElement | null>(null);

  const streamRef =
    useRef<MediaStream | null>(null);

  /* -------------------------------------------------------
     STATE
  ------------------------------------------------------- */

  const [state, setState] =
    useState<DetectionState>("idle");

  const [cameraState, setCameraState] =
    useState<CameraState>("closed");

  const [selectedFile, setSelectedFile] =
    useState<File | null>(null);

  const [previewUrl, setPreviewUrl] =
    useState("");

  const [result, setResult] =
    useState<PredictionResponse | null>(null);

  const [error, setError] =
    useState("");

  const [dragActive, setDragActive] =
    useState(false);

  const [uploadProgress, setUploadProgress] =
    useState(0);

  /* =======================================================
     CLEANUP
  ======================================================= */

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  /* =======================================================
     FILE VALIDATION
  ======================================================= */

  function validateFile(file: File) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError(
        "Please select a JPG, PNG, or WEBP image."
      );

      return false;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError(
        "Image size must be 10 MB or smaller."
      );

      return false;
    }

    return true;
  }

  /* =======================================================
     SELECT FILE
  ======================================================= */

  function selectFile(file: File) {
    setError("");

    if (!validateFile(file)) {
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    const url =
      URL.createObjectURL(file);

    setSelectedFile(file);
    setPreviewUrl(url);
    setResult(null);
    setUploadProgress(0);
    setState("preview");

    stopCamera();
  }

  /* =======================================================
     FILE INPUT
  ======================================================= */

  function handleFileChange(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file =
      event.target.files?.[0];

    if (!file) {
      return;
    }

    selectFile(file);

    event.target.value = "";
  }

  /* =======================================================
     DRAG & DROP
  ======================================================= */

  function handleDragOver(
    event: DragEvent<HTMLDivElement>
  ) {
    event.preventDefault();
    setDragActive(true);
  }

  function handleDragLeave(
    event: DragEvent<HTMLDivElement>
  ) {
    event.preventDefault();
    setDragActive(false);
  }

  function handleDrop(
    event: DragEvent<HTMLDivElement>
  ) {
    event.preventDefault();

    setDragActive(false);

    const file =
      event.dataTransfer.files?.[0];

    if (file) {
      selectFile(file);
    }
  }

  /* =======================================================
     CAMERA
  ======================================================= */

  async function openCamera() {
    setError("");

    if (
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setError(
        "Camera access is not supported by this browser."
      );

      return;
    }

    try {
      setCameraState("opening");

      const stream =
        await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: {
              ideal: "environment",
            },
            width: {
              ideal: 1280,
            },
            height: {
              ideal: 720,
            },
          },
          audio: false,
        });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject =
          stream;

        await videoRef.current.play();
      }

      setCameraState("active");
    } catch (err) {
      console.error(
        "Camera error:",
        err
      );

      setCameraState("closed");

      setError(
        "Unable to access the camera. Please allow camera permission or upload an image instead."
      );
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current
        .getTracks()
        .forEach((track) =>
          track.stop()
        );

      streamRef.current = null;
    }

    setCameraState("closed");
  }

  /* =======================================================
     CAPTURE PHOTO
  ======================================================= */

  function capturePhoto() {
    const video =
      videoRef.current;

    if (!video) {
      return;
    }

    if (
      video.videoWidth === 0 ||
      video.videoHeight === 0
    ) {
      setError(
        "Camera is not ready yet."
      );

      return;
    }

    const canvas =
      document.createElement("canvas");

    canvas.width =
      video.videoWidth;

    canvas.height =
      video.videoHeight;

    const context =
      canvas.getContext("2d");

    if (!context) {
      setError(
        "Unable to capture camera image."
      );

      return;
    }

    context.drawImage(
      video,
      0,
      0,
      canvas.width,
      canvas.height
    );

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError(
            "Unable to create image."
          );

          return;
        }

        const file =
          new File(
            [blob],
            `wheatguard-camera-${Date.now()}.jpg`,
            {
              type: "image/jpeg",
            }
          );

        selectFile(file);

        stopCamera();
      },
      "image/jpeg",
      0.92
    );
  }

  /* =======================================================
     REMOVE IMAGE
  ======================================================= */

  function removeImage() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setPreviewUrl("");
    setSelectedFile(null);
    setResult(null);
    setUploadProgress(0);
    setError("");
    setState("idle");
  }

  /* =======================================================
     PREDICT IMAGE
  ======================================================= */

  async function analyzeImage() {
    if (!selectedFile) {
      setError(
        "Please select an image first."
      );

      return;
    }

    setError("");
    setResult(null);
    setUploadProgress(0);
    setState("analyzing");

    try {
      /*
       * IMPORTANT:
       * This uses your actual API function:
       *
       * predictImage(file)
       *
       * which calls:
       *
       * POST /api/v1/predict
       */

      const prediction =
        await predictImage(
          selectedFile,
          {
            includeGradcam: true,
            topK: 3,

            onProgress: (progress) => {
              setUploadProgress(
                progress
              );
            },
          }
        );

      setResult(prediction);

      setState("result");

      setUploadProgress(100);

    } catch (err) {
      console.error(
        "Prediction failed:",
        err
      );

      setState("preview");

      setError(
        err instanceof Error
          ? err.message
          : "Disease prediction failed. Please try again."
      );
    }
  }

  /* =======================================================
     NEW ANALYSIS
  ======================================================= */

  function newAnalysis() {
    removeImage();

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <main className="min-h-screen bg-canvas">

      <div className="mx-auto max-w-7xl animate-slide-up p-5 lg:p-8">

        {/* =================================================
            HEADER
        ================================================= */}

        <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

          <div>

            <div className="mb-2 flex items-center gap-2">

              <span className="material-symbols-outlined text-brand-600">
                neurology
              </span>

              <span className="text-sm font-semibold text-brand-600">
                WheatGuard AI
              </span>

            </div>

            <h1 className="font-serif text-3xl font-bold tracking-tight text-ink">
              AI Disease Detection
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Upload or capture a wheat leaf
              image and let WheatGuard AI
              identify possible diseases.
            </p>

          </div>

          <Button
            variant="outline"
            leftIcon="history"
            onClick={() => router.push("/dashboard/history")}
          >
            Prediction History
          </Button>

        </div>

        {/* =================================================
            ERROR
        ================================================= */}

        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-danger/20 bg-danger-soft p-4 text-sm text-danger">

            <span className="material-symbols-outlined">
              error
            </span>

            <p className="flex-1">
              {error}
            </p>

            <button
              onClick={() =>
                setError("")
              }
              className="font-bold"
            >
              ×
            </button>

          </div>
        )}

        {/* =================================================
            PROGRESS STEPS
        ================================================= */}

        <div className="mb-6 rounded-2xl border border-line bg-surface p-4 shadow-sm">

          <div className="flex items-center">

            {/* STEP 1 */}

            <div className="flex items-center gap-2">

              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-900 text-sm font-bold text-white">
                1
              </div>

              <span className="hidden text-sm font-semibold sm:block">
                Select Image
              </span>

            </div>

            <div className="mx-3 h-px flex-1 bg-line" />

            {/* STEP 2 */}

            <div className="flex items-center gap-2">

              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${
                  state === "analyzing" ||
                  state === "result"
                    ? "bg-brand-900 text-white"
                    : "bg-surface-muted text-muted"
                }`}
              >
                2
              </div>

              <span className="hidden text-sm font-semibold sm:block">
                Analyze
              </span>

            </div>

            <div className="mx-3 h-px flex-1 bg-line" />

            {/* STEP 3 */}

            <div className="flex items-center gap-2">

              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${
                  state === "result"
                    ? "bg-brand-900 text-white"
                    : "bg-surface-muted text-muted"
                }`}
              >
                3
              </div>

              <span className="hidden text-sm font-semibold sm:block">
                Result
              </span>

            </div>

          </div>

        </div>

        {/* =================================================
            MAIN GRID
        ================================================= */}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">

          {/* =================================================
              LEFT
          ================================================= */}

          <section className="xl:col-span-8">

            {/* =================================================
                CAMERA
            ================================================= */}

            {cameraState !== "closed" && (
              <div className="mb-6 overflow-hidden rounded-2xl border border-line bg-black shadow-sm">

                <div className="relative aspect-video">

                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="h-full w-full object-cover"
                  />

                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">

                    <div className="h-[65%] w-[70%] rounded-2xl border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,.25)]" />

                  </div>

                  {cameraState ===
                    "opening" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60">

                      <div className="text-center text-white">

                        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />

                        Opening camera...

                      </div>

                    </div>
                  )}

                </div>

                <div className="flex justify-center gap-3 p-4">

                  <button
                    onClick={
                      capturePhoto
                    }
                    disabled={
                      cameraState !==
                      "active"
                    }
                    className="inline-flex items-center gap-2 rounded-xl bg-surface px-5 py-3 text-sm font-bold text-brand-900 disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined">
                      photo_camera
                    </span>

                    Capture Photo
                  </button>

                  <button
                    onClick={
                      stopCamera
                    }
                    className="rounded-xl border border-white/20 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
                  >
                    Cancel
                  </button>

                </div>

              </div>
            )}

            {/* =================================================
                UPLOAD
            ================================================= */}

            {state === "idle" &&
              cameraState ===
                "closed" && (

              <div
                onDragOver={
                  handleDragOver
                }
                onDragLeave={
                  handleDragLeave
                }
                onDrop={handleDrop}
                className={`rounded-2xl border-2 border-dashed bg-surface p-8 text-center shadow-sm transition-colors duration-200 sm:p-12 ${
                  dragActive
                    ? "border-brand-500 bg-brand-50/60 dark:bg-brand-900/30"
                    : "border-line hover:border-brand-500"
                }`}
              >

                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">

                  <span className="material-symbols-outlined text-[40px]">
                    cloud_upload
                  </span>

                </div>

                <h2 className="mt-5 text-xl font-bold text-ink">
                  Upload Wheat Leaf Image
                </h2>

                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
                  Drag and drop your wheat leaf
                  image here or select one from
                  your device.
                </p>

                <Button
                  size="lg"
                  leftIcon="folder_open"
                  className="mt-6"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Browse Image
                </Button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={
                    handleFileChange
                  }
                  className="hidden"
                />

                <p className="mt-5 text-xs text-muted">
                  JPG, PNG or WEBP · Maximum 10 MB
                </p>

                <div className="my-6 flex items-center gap-3">

                  <div className="h-px flex-1 bg-line" />

                  <span className="text-xs text-muted">
                    OR
                  </span>

                  <div className="h-px flex-1 bg-line" />

                </div>

                <Button
                  variant="outline"
                  size="lg"
                  leftIcon="photo_camera"
                  onClick={openCamera}
                >
                  Use Camera
                </Button>

              </div>
            )}

            {/* =================================================
                PREVIEW
            ================================================= */}

            {(state === "preview" ||
              state === "analyzing") &&
              selectedFile && (

              <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">

                <div className="border-b border-line px-5 py-4">

                  <h2 className="font-semibold text-ink">
                    Image Preview
                  </h2>

                  <p className="mt-1 text-xs text-muted">
                    Review the image before
                    running AI detection.
                  </p>

                </div>

                <div className="grid gap-6 p-5 lg:grid-cols-2">

                  {/* IMAGE */}

                  <div className="overflow-hidden rounded-xl bg-surface-muted">

                    {previewUrl && (
                      <img
                        src={previewUrl}
                        alt="Selected wheat leaf"
                        className="aspect-square h-full w-full object-contain"
                      />
                    )}

                  </div>

                  {/* INFO */}

                  <div className="flex flex-col justify-between">

                    <div>

                      <div className="rounded-xl bg-surface-muted p-4">

                        <p className="text-xs text-muted">
                          File Name
                        </p>

                        <p className="mt-1 break-all text-sm font-semibold text-ink">
                          {selectedFile.name}
                        </p>

                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-3">

                        <div className="rounded-xl bg-surface-muted p-4">

                          <p className="text-xs text-muted">
                            File Type
                          </p>

                          <p className="mt-1 text-sm font-semibold">
                            {selectedFile.type
                              .replace(
                                "image/",
                                ""
                              )
                              .toUpperCase()}
                          </p>

                        </div>

                        <div className="rounded-xl bg-surface-muted p-4">

                          <p className="text-xs text-muted">
                            File Size
                          </p>

                          <p className="mt-1 text-sm font-semibold">
                            {formatFileSize(
                              selectedFile.size
                            )}
                          </p>

                        </div>

                      </div>

                    </div>

                    <div className="mt-6 space-y-3">

                      <button
                        onClick={
                          analyzeImage
                        }
                        disabled={
                          state ===
                          "analyzing"
                        }
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-900 px-5 py-3.5 text-sm font-bold text-white disabled:opacity-60"
                      >

                        {state ===
                        "analyzing" ? (
                          <>
                            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />

                            Analyzing...
                          </>
                        ) : (
                          <>
                            <span className="material-symbols-outlined">
                              neurology
                            </span>

                            Analyze Disease
                          </>
                        )}

                      </button>

                      {state ===
                        "analyzing" && (
                        <div>

                          <div className="mb-1 flex justify-between text-xs text-muted">

                            <span>
                              Uploading
                            </span>

                            <span>
                              {uploadProgress}%
                            </span>

                          </div>

                          <div className="h-2 overflow-hidden rounded-full bg-surface-muted">

                            <div
                              className="h-full rounded-full bg-brand-600 transition-all"
                              style={{
                                width: `${uploadProgress}%`,
                              }}
                            />

                          </div>

                        </div>
                      )}

                      <button
                        onClick={
                          removeImage
                        }
                        disabled={
                          state ===
                          "analyzing"
                        }
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-line px-5 py-3 text-sm font-semibold text-ink hover:bg-surface-muted disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined">
                          delete
                        </span>

                        Remove Image
                      </button>

                    </div>

                  </div>

                </div>

              </div>
            )}

            {/* =================================================
                RESULT
            ================================================= */}

            {state === "result" &&
              result && (

              <div className="space-y-6">

                {/* RESULT CARD */}

                <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">

                  <div className="border-b border-line bg-surface-muted px-5 py-4">

                    <div className="flex items-center gap-3">

                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">

                        <span className="material-symbols-outlined">
                          check_circle
                        </span>

                      </div>

                      <div>

                        <h2 className="font-semibold text-ink">
                          AI Prediction Complete
                        </h2>

                        <p className="text-xs text-muted">
                          WheatGuard has analyzed your
                          wheat leaf.
                        </p>

                      </div>

                    </div>

                  </div>

                  <div className="grid gap-6 p-5 lg:grid-cols-2">

                    {/* IMAGE */}

                    <div className="overflow-hidden rounded-xl bg-surface-muted">

                      {previewUrl && (
                        <img
                          src={previewUrl}
                          alt="Analyzed wheat leaf"
                          className="aspect-square h-full w-full object-contain"
                        />
                      )}

                    </div>

                    {/* RESULT */}

                    <div>

                      <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                        Predicted Condition
                      </p>

                      <h3 className="mt-2 text-3xl font-bold text-brand-900">
                        {result.prediction}
                      </h3>

                      {/* CONFIDENCE */}

                      <div className="mt-5">

                        <div className="mb-2 flex justify-between">

                          <span className="text-sm font-medium text-ink">
                            Confidence
                          </span>

                          <span className="text-sm font-bold text-brand-900">
                            {formatConfidence(
                              result.confidence_percentage
                            )}
                          </span>

                        </div>

                        <div className="h-3 overflow-hidden rounded-full bg-surface-muted">

                          <div
                            className="h-full rounded-full bg-brand-600"
                            style={{
                              width: `${Math.min(
                                getConfidence(
                                  result.confidence_percentage
                                ),
                                100
                              )}%`,
                            }}
                          />

                        </div>

                        <p className="mt-2 text-xs text-muted">
                          Confidence level:{" "}
                          {result.confidence_level}
                        </p>

                      </div>

                      {/* META */}

                      <div className="mt-5 grid grid-cols-2 gap-3">

                        <div className="rounded-xl bg-surface-muted p-4">

                          <p className="text-xs text-muted">
                            Severity
                          </p>

                          <span
                            className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-bold ${getSeverityClass(
                              result.severity
                            )}`}
                          >
                            {result.severity}
                          </span>

                        </div>

                        <div className="rounded-xl bg-surface-muted p-4">

                          <p className="text-xs text-muted">
                            Model
                          </p>

                          <p className="mt-2 text-sm font-bold text-ink">
                            {result.model_version}
                          </p>

                        </div>

                      </div>

                      {/* LOW CONFIDENCE */}

                      {result.low_confidence && (
                        <div className="mt-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">

                          <span className="material-symbols-outlined text-amber-600">
                            warning
                          </span>

                          <div>

                            <p className="text-sm font-bold text-amber-800">
                              Low Confidence
                            </p>

                            <p className="mt-1 text-xs leading-5 text-amber-700">
                              Consider uploading a clearer
                              image of the wheat leaf for
                              a more reliable prediction.
                            </p>

                          </div>

                        </div>
                      )}

                      {/* EMAIL ALERT — shown only when the backend confirmed delivery */}

                      {result.email_sent && (
                        <div className="mt-4 flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">

                          <span className="material-symbols-outlined text-brand-600">
                            mark_email_read
                          </span>

                          <div>

                            <p className="text-sm font-bold text-emerald-800">
                              Email alert sent
                            </p>

                            <p className="mt-1 text-xs leading-5 text-emerald-700">
                              {String(result.severity || "").toLowerCase() ===
                              "critical"
                                ? "Critical disease detected."
                                : "High-risk disease detected."}{" "}
                              An alert has been sent to your registered email
                              address.
                            </p>

                          </div>

                        </div>
                      )}

                    </div>

                  </div>

                </div>

                {/* =================================================
                    DISEASE INFORMATION
                ================================================= */}

                {result.disease_info && (
                  <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">

                    <div className="flex items-center gap-3">

                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-brand-600">

                        <span className="material-symbols-outlined">
                          medical_information
                        </span>

                      </div>

                      <div>

                        <h2 className="font-semibold text-ink">
                          Disease Information
                        </h2>

                        <p className="text-xs text-muted">
                          Information provided by WheatGuard.
                        </p>

                      </div>

                    </div>

                    <div className="mt-5">

                      <h3 className="text-xl font-bold text-brand-900">
                        {result.disease_info.display_name}
                      </h3>

                      <p className="mt-3 text-sm leading-7 text-ink">
                        {result.disease_info.description}
                      </p>

                    </div>

                    <div className="mt-6 grid gap-5 md:grid-cols-3">

                      {/* SYMPTOMS */}

                      <div>

                        <h4 className="flex items-center gap-2 text-sm font-bold text-ink">

                          <span className="material-symbols-outlined text-[19px] text-red-500">
                            symptoms
                          </span>

                          Symptoms

                        </h4>

                        <ul className="mt-3 space-y-2">

                          {result.disease_info.symptoms.map(
                            (item, index) => (
                              <li
                                key={index}
                                className="flex gap-2 text-xs leading-5 text-ink"
                              >
                                <span className="mt-1 text-brand-600">
                                  •
                                </span>

                                {item}
                              </li>
                            )
                          )}

                        </ul>

                      </div>

                      {/* PREVENTION */}

                      <div>

                        <h4 className="flex items-center gap-2 text-sm font-bold text-ink">

                          <span className="material-symbols-outlined text-[19px] text-blue-500">
                            shield
                          </span>

                          Prevention

                        </h4>

                        <ul className="mt-3 space-y-2">

                          {result.disease_info.prevention.map(
                            (item, index) => (
                              <li
                                key={index}
                                className="flex gap-2 text-xs leading-5 text-ink"
                              >
                                <span className="mt-1 text-brand-600">
                                  •
                                </span>

                                {item}
                              </li>
                            )
                          )}

                        </ul>

                      </div>

                      {/* MANAGEMENT */}

                      <div>

                        <h4 className="flex items-center gap-2 text-sm font-bold text-ink">

                          <span className="material-symbols-outlined text-[19px] text-amber-500">
                            agriculture
                          </span>

                          Management

                        </h4>

                        <ul className="mt-3 space-y-2">

                          {result.disease_info.management.map(
                            (item, index) => (
                              <li
                                key={index}
                                className="flex gap-2 text-xs leading-5 text-ink"
                              >
                                <span className="mt-1 text-brand-600">
                                  •
                                </span>

                                {item}
                              </li>
                            )
                          )}

                        </ul>

                      </div>

                    </div>

                  </div>
                )}

                {/* =================================================
                    TOP PREDICTIONS
                ================================================= */}

                {result.top_predictions &&
                  result.top_predictions.length >
                    0 && (

                  <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">

                    <h2 className="font-semibold text-ink">
                      AI Prediction Ranking
                    </h2>

                    <p className="mt-1 text-xs text-muted">
                      Top classes considered by the
                      model.
                    </p>

                    <div className="mt-5 space-y-4">

                      {result.top_predictions.map(
                        (item) => (

                          <div
                            key={item.rank}
                            className="flex items-center gap-3"
                          >

                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-xs font-bold text-brand-900">
                              #{item.rank}
                            </div>

                            <div className="min-w-0 flex-1">

                              <div className="mb-1 flex justify-between gap-3">

                                <span className="truncate text-sm font-semibold text-ink">
                                  {item.class_name}
                                </span>

                                <span className="text-xs font-bold text-brand-600">
                                  {formatConfidence(
                                    item.confidence_percentage
                                  )}
                                </span>

                              </div>

                              <div className="h-2 overflow-hidden rounded-full bg-surface-muted">

                                <div
                                  className="h-full rounded-full bg-brand-600"
                                  style={{
                                    width: `${Math.min(
                                      getConfidence(
                                        item.confidence_percentage
                                      ),
                                      100
                                    )}%`,
                                  }}
                                />

                              </div>

                            </div>

                          </div>

                        )
                      )}

                    </div>

                  </div>
                )}

                {/* =================================================
                    RECOMMENDATION
                ================================================= */}

                {result.recommendation && (
                  <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">

                    <div className="flex gap-3">

                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-blue-600">

                        <span className="material-symbols-outlined">
                          lightbulb
                        </span>

                      </div>

                      <div>

                        <h2 className="font-semibold text-blue-900">
                          Recommendation
                        </h2>

                        <p className="mt-2 text-sm leading-7 text-blue-800">
                          {result.recommendation}
                        </p>

                      </div>

                    </div>

                  </div>
                )}

                {/* =================================================
                    GRAD-CAM
                ================================================= */}

                {result.gradcam_available &&
                  result.gradcam && (

                  <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">

                    <div className="flex items-center gap-3">

                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600">

                        <span className="material-symbols-outlined">
                          visibility
                        </span>

                      </div>

                      <div>

                        <h2 className="font-semibold text-ink">
                          AI Attention Analysis
                        </h2>

                        <p className="text-xs text-muted">
                          Areas that influenced the model
                          prediction.
                        </p>

                      </div>

                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-3">

                      <div>

                        <p className="mb-2 text-xs font-semibold text-muted">
                          Original
                        </p>

                        <img
                          src={
                            result.gradcam
                              .original
                          }
                          alt="Original leaf"
                          className="aspect-square w-full rounded-xl object-cover"
                        />

                      </div>

                      <div>

                        <p className="mb-2 text-xs font-semibold text-muted">
                          Heatmap
                        </p>

                        <img
                          src={
                            result.gradcam
                              .heatmap
                          }
                          alt="AI heatmap"
                          className="aspect-square w-full rounded-xl object-cover"
                        />

                      </div>

                      <div>

                        <p className="mb-2 text-xs font-semibold text-muted">
                          Overlay
                        </p>

                        <img
                          src={
                            result.gradcam
                              .overlay
                          }
                          alt="AI attention overlay"
                          className="aspect-square w-full rounded-xl object-cover"
                        />

                      </div>

                    </div>

                  </div>
                )}

                {/* =================================================
                    AI REPORT
                ================================================= */}

                {result.ai_report && (
                  <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">

                    <div className="flex items-center gap-3">

                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-900 text-white">

                        <span className="material-symbols-outlined">
                          article
                        </span>

                      </div>

                      <div>

                        <h2 className="font-semibold text-ink">
                          AI Diagnosis Report
                        </h2>

                        <p className="text-xs text-muted">
                          Generated analysis report.
                        </p>

                      </div>

                    </div>

                    <div className="mt-5 space-y-5">

                      <div>

                        <h3 className="font-bold text-brand-900">
                          {result.ai_report.title}
                        </h3>

                      </div>

                      <div>

                        <h4 className="text-sm font-bold text-ink">
                          Problem
                        </h4>

                        <p className="mt-1 text-sm leading-6 text-ink">
                          {result.ai_report.problem}
                        </p>

                      </div>

                      <div>

                        <h4 className="text-sm font-bold text-ink">
                          Solution
                        </h4>

                        <p className="mt-1 text-sm leading-6 text-ink">
                          {result.ai_report.solution}
                        </p>

                      </div>

                    </div>

                  </div>
                )}

                {/* =================================================
                    ACTIONS
                ================================================= */}

                <div className="flex flex-col gap-3 sm:flex-row">

                  <button
                    onClick={
                      newAnalysis
                    }
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-900 px-5 py-3.5 text-sm font-bold text-white hover:bg-brand-950"
                  >

                    <span className="material-symbols-outlined">
                      add_a_photo
                    </span>

                    Analyze Another Image

                  </button>

                  <button
                    onClick={() =>
                      router.push(
                        "/dashboard/history"
                      )
                    }
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-5 py-3.5 text-sm font-semibold text-ink hover:bg-surface-muted"
                  >

                    <span className="material-symbols-outlined">
                      history
                    </span>

                    View Prediction History

                  </button>

                  <button
                    onClick={() =>
                      router.push("/dashboard/calendar")
                    }
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
                  >

                    <span className="material-symbols-outlined">
                      calendar_month
                    </span>

                    View in Calendar

                  </button>

                </div>

              </div>
            )}

          </section>

          {/* =================================================
              RIGHT SIDEBAR
          ================================================= */}

          <aside className="space-y-5 xl:col-span-4">

            {/* BEST RESULTS */}

            <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">

              <div className="flex items-center gap-3">

                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">

                  <span className="material-symbols-outlined">
                    tips_and_updates
                  </span>

                </div>

                <div>

                  <h2 className="font-semibold text-ink">
                    For Best Results
                  </h2>

                  <p className="text-xs text-muted">
                    Improve prediction quality.
                  </p>

                </div>

              </div>

              <div className="mt-5 space-y-4">

                {[
                  {
                    icon: "light_mode",
                    title: "Good Lighting",
                    text: "Use a clear, well-lit image.",
                  },
                  {
                    icon: "center_focus_strong",
                    title: "Sharp Image",
                    text: "Avoid blurry or out-of-focus photos.",
                  },
                  {
                    icon: "crop_free",
                    title: "Show the Leaf",
                    text: "Keep the affected leaf area visible.",
                  },
                  {
                    icon: "hide_image",
                    title: "Simple Background",
                    text: "Avoid distracting objects behind the leaf.",
                  },
                ].map((tip) => (

                  <div
                    key={tip.title}
                    className="flex gap-3"
                  >

                    <span className="material-symbols-outlined text-[19px] text-brand-600">
                      {tip.icon}
                    </span>

                    <div>

                      <p className="text-sm font-semibold text-ink">
                        {tip.title}
                      </p>

                      <p className="mt-0.5 text-xs leading-5 text-muted">
                        {tip.text}
                      </p>

                    </div>

                  </div>

                ))}

              </div>

            </div>

            {/* SUPPORTED DISEASES */}

            <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">

              <h2 className="font-semibold text-ink">
                Supported Classes
              </h2>

              <p className="mt-1 text-xs leading-5 text-muted">
                Classes recognized by the current
                AI model.
              </p>

              <div className="mt-4 space-y-2">

                {[
                  "Healthy",
                  "Yellow Rust",
                  "Brown Rust",
                  "Septoria",
                  "Powdery Mildew",
                ].map((disease) => (

                  <div
                    key={disease}
                    className="flex items-center gap-2 rounded-lg bg-surface-muted px-3 py-2.5"
                  >

                    <span className="material-symbols-outlined text-[17px] text-brand-600">
                      check_circle
                    </span>

                    <span className="text-sm text-ink">
                      {disease}
                    </span>

                  </div>

                ))}

              </div>

            </div>

            {/* HOW IT WORKS */}

            <div className="rounded-2xl bg-brand-900 p-5 text-white shadow-sm">

              <div className="flex items-center gap-2">

                <span className="material-symbols-outlined">
                  psychology
                </span>

                <h2 className="font-semibold">
                  How Detection Works
                </h2>

              </div>

              <div className="mt-5 space-y-4">

                {[
                  [
                    "01",
                    "Upload",
                    "Choose a wheat leaf image.",
                  ],
                  [
                    "02",
                    "Analyze",
                    "The AI model examines the image.",
                  ],
                  [
                    "03",
                    "Predict",
                    "WheatGuard identifies the likely disease.",
                  ],
                  [
                    "04",
                    "Recommend",
                    "Get confidence and management guidance.",
                  ],
                ].map(
                  ([number, title, text]) => (

                    <div
                      key={number}
                      className="flex gap-3"
                    >

                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold">
                        {number}
                      </div>

                      <div>

                        <p className="text-sm font-semibold">
                          {title}
                        </p>

                        <p className="mt-0.5 text-xs leading-5 text-white/60">
                          {text}
                        </p>

                      </div>

                    </div>

                  )
                )}

              </div>

            </div>

          </aside>

        </div>

      </div>

    </main>
  );
}

