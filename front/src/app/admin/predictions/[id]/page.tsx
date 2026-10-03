"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  fetchAdminPrediction,
  type AdminPredictionLog,
} from "@/lib/api";

export default function AdminPredictionDetailPage() {
  const params = useParams();
  const router = useRouter();

  const predictionId = String(params.id ?? "");

  const [prediction, setPrediction] =
    useState<AdminPredictionLog | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!predictionId) {
      setError("Invalid prediction ID.");
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadPrediction = async () => {
      try {
        setLoading(true);
        setError("");

        const result = await fetchAdminPrediction(predictionId);

        if (!cancelled) {
          setPrediction(result);
        }
      } catch (err) {
        console.error("Failed to load prediction:", err);

        if (!cancelled) {
          setPrediction(null);

          setError(
            err instanceof Error
              ? err.message
              : "Failed to load prediction details."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadPrediction();

    return () => {
      cancelled = true;
    };
  }, [predictionId]);

  const severity = useMemo(() => {
    return String(prediction?.severity ?? "unknown").toLowerCase();
  }, [prediction]);

  const getSeverityStyles = () => {
    if (
      severity.includes("critical") ||
      severity.includes("high")
    ) {
      return {
        badge: "bg-red-100 text-red-700 border-red-200",
        card: "border-red-200 bg-red-50",
        accent: "bg-red-600",
      };
    }

    if (
      severity.includes("moderate") ||
      severity.includes("medium")
    ) {
      return {
        badge: "bg-yellow-100 text-yellow-700 border-yellow-200",
        card: "border-yellow-200 bg-yellow-50",
        accent: "bg-yellow-500",
      };
    }

    if (
      severity.includes("low") ||
      severity.includes("none") ||
      severity.includes("healthy")
    ) {
      return {
        badge: "bg-green-100 text-green-700 border-green-200",
        card: "border-green-200 bg-green-50",
        accent: "bg-green-600",
      };
    }

    return {
      badge: "bg-gray-100 text-gray-700 border-gray-200",
      card: "border-gray-200 bg-gray-50",
      accent: "bg-gray-500",
    };
  };

  const severityStyles = getSeverityStyles();

  const confidence = Number(
    prediction?.confidence_pct ?? 0
  );

  const safeConfidence = Number.isFinite(confidence)
    ? Math.min(Math.max(confidence, 0), 100)
    : 0;

  const formatDate = (date?: string) => {
    if (!date) return "—";

    const parsed = new Date(date);

    if (Number.isNaN(parsed.getTime())) {
      return date;
    }

    return parsed.toLocaleString();
  };

  const humanize = (value?: string | null) => {
    if (!value) return "Unknown";

    return value
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const getTopPredictionClass = (
    item: Record<string, unknown>
  ) => {
    const value =
      item.class_name ??
      item.predicted_class ??
      item.label ??
      item.class ??
      "Unknown";

    return String(value);
  };

  const getTopPredictionConfidence = (
    item: Record<string, unknown>
  ) => {
    const raw =
      item.confidence_percentage ??
      item.confidence_pct ??
      item.confidence ??
      0;

    const value = Number(raw);

    if (!Number.isFinite(value)) {
      return 0;
    }

    // If backend gives 0.95 instead of 95.
    if (value > 0 && value <= 1) {
      return value * 100;
    }

    return value;
  };

  const handleBack = () => {
    if (prediction?.user_id) {
      router.push(
        `/admin/users/${encodeURIComponent(
          prediction.user_id
        )}/predictions`
      );
      return;
    }

    router.push("/admin/users");
  };

  if (loading) {
    return (
      <div className="space-y-5">

        <div>
          <button
            type="button"
            onClick={() => router.back()}
            className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-gray-500 transition hover:text-gray-900"
          >
            ← Back
          </button>

          <h1 className="text-2xl font-bold text-gray-900">
            Prediction Details
          </h1>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-14 text-center shadow-sm">

          <span
            className="material-symbols-outlined animate-spin text-green-800"
            style={{ fontSize: 42 }}
          >
            progress_activity
          </span>

          <p className="mt-4 text-sm font-medium text-gray-700">
            Loading prediction details...
          </p>

          <p className="mt-1 text-xs text-gray-400">
            Prediction ID: {predictionId}
          </p>

        </div>

      </div>
    );
  }

  if (error || !prediction) {
    return (
      <div className="space-y-5">

        <div>
          <button
            type="button"
            onClick={() => router.back()}
            className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-gray-500 transition hover:text-gray-900"
          >
            ← Back
          </button>

          <h1 className="text-2xl font-bold text-gray-900">
            Prediction Details
          </h1>
        </div>

        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">

          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
            <span
              className="material-symbols-outlined text-red-600"
              style={{ fontSize: 30 }}
            >
              error
            </span>
          </div>

          <h2 className="mt-4 text-lg font-bold text-red-800">
            Unable to load prediction
          </h2>

          <p className="mx-auto mt-2 max-w-lg text-sm text-red-700">
            {error || "Prediction was not found."}
          </p>

          <p className="mt-2 text-xs text-red-500">
            ID: {predictionId}
          </p>

          <button
            type="button"
            onClick={() => router.back()}
            className="mt-5 rounded-lg bg-green-800 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-green-900"
          >
            Go Back
          </button>

        </div>

      </div>
    );
  }

  const topPredictions = Array.isArray(
    prediction.top_predictions
  )
    ? prediction.top_predictions
    : [];

  const symptoms = Array.isArray(prediction.symptoms)
    ? prediction.symptoms
    : [];

  const prevention = Array.isArray(prediction.prevention)
    ? prediction.prevention
    : [];

  const management = Array.isArray(prediction.management)
    ? prediction.management
    : [];

  return (
    <div className="space-y-5 pb-10">

      {/* ================================================================
          HEADER
      ================================================================= */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">

        <div>
          <button
            type="button"
            onClick={handleBack}
            className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-gray-500 transition hover:text-gray-900"
          >
            ← Back to Predictions
          </button>

          <div className="flex flex-wrap items-center gap-3">

            <h1 className="text-2xl font-bold text-gray-900">
              Prediction Details
            </h1>

            <span
              className={`rounded-full border px-3 py-1 text-[11px] font-bold capitalize ${severityStyles.badge}`}
            >
              {humanize(prediction.severity)}
            </span>

          </div>

          <p className="mt-1 text-[13px] text-gray-500">
            Complete analysis for{" "}
            <span className="font-medium text-gray-700">
              {prediction.filename || "uploaded image"}
            </span>
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white px-5 py-3 shadow-sm">

          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Prediction ID
          </p>

          <p className="mt-1 max-w-[220px] truncate font-mono text-xs font-medium text-gray-700">
            {prediction.id}
          </p>

        </div>

      </div>

      {/* ================================================================
          MAIN RESULT
      ================================================================= */}
      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">

        {/* Image */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">

          <div className="border-b border-gray-200 px-5 py-4">
            <h2 className="text-sm font-bold text-gray-900">
              Analyzed Image
            </h2>

            <p className="mt-0.5 text-xs text-gray-500">
              {prediction.filename || "Prediction image"}
            </p>
          </div>

          <div className="p-5">

            {prediction.image_url ? (
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50">

                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={prediction.image_url}
                  alt={
                    prediction.filename ||
                    "Wheat disease prediction"
                  }
                  className="max-h-[520px] w-full object-contain"
                />

              </div>
            ) : (
              <div className="flex h-[380px] items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50">

                <div className="text-center">

                  <span
                    className="material-symbols-outlined text-gray-300"
                    style={{ fontSize: 64 }}
                  >
                    image_not_supported
                  </span>

                  <p className="mt-3 text-sm font-medium text-gray-500">
                    Image not available
                  </p>

                  <p className="mt-1 text-xs text-gray-400">
                    No image URL was stored for this prediction.
                  </p>

                </div>

              </div>
            )}

          </div>

        </div>

        {/* Prediction result */}
        <div className="space-y-5">

          <div
            className={`relative overflow-hidden rounded-xl border p-6 shadow-sm ${severityStyles.card}`}
          >

            <div
              className={`absolute left-0 top-0 h-full w-1 ${severityStyles.accent}`}
            />

            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
              Detected Disease
            </p>

            <h2 className="mt-2 text-3xl font-extrabold text-gray-900">
              {humanize(prediction.predicted_class)}
            </h2>

            <div className="mt-6">

              <div className="flex items-end justify-between">

                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    Confidence
                  </p>

                  <p className="mt-1 text-3xl font-extrabold text-green-800">
                    {safeConfidence.toFixed(1)}%
                  </p>
                </div>

                <span
                  className={`rounded-full border px-3 py-1.5 text-xs font-bold capitalize ${severityStyles.badge}`}
                >
                  {humanize(prediction.severity)}
                </span>

              </div>

              <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/70">

                <div
                  className="h-full rounded-full bg-green-600 transition-all"
                  style={{
                    width: `${safeConfidence}%`,
                  }}
                />

              </div>

            </div>

          </div>

          {/* Recommendation */}
          <div className="rounded-xl border border-green-200 bg-green-50 p-5">

            <div className="flex items-start gap-3">

              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-100">

                <span
                  className="material-symbols-outlined text-green-700"
                  style={{ fontSize: 22 }}
                >
                  lightbulb
                </span>

              </div>

              <div className="min-w-0">

                <h3 className="text-sm font-bold text-green-900">
                  Recommendation
                </h3>

                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-green-800">
                  {prediction.recommendation ||
                    "No recommendation was provided for this prediction."}
                </p>

              </div>

            </div>

          </div>

        </div>

      </div>

      {/* ================================================================
          TOP PREDICTIONS
      ================================================================= */}
      {topPredictions.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white shadow-sm">

          <div className="border-b border-gray-200 px-5 py-4">

            <h2 className="text-sm font-bold text-gray-900">
              Top Predictions
            </h2>

            <p className="mt-0.5 text-xs text-gray-500">
              Model confidence distribution across possible classes.
            </p>

          </div>

          <div className="space-y-4 p-5">

            {topPredictions.map((item, index) => {

              const itemConfidence =
                getTopPredictionConfidence(item);

              const safeItemConfidence = Math.min(
                Math.max(itemConfidence, 0),
                100
              );

              const isFirst = index === 0;

              return (
                <div
                  key={`${getTopPredictionClass(item)}-${index}`}
                  className={`rounded-lg border p-4 ${
                    isFirst
                      ? "border-green-200 bg-green-50"
                      : "border-gray-200 bg-gray-50"
                  }`}
                >

                  <div className="flex items-center justify-between gap-4">

                    <div className="flex min-w-0 items-center gap-3">

                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          isFirst
                            ? "bg-green-700 text-white"
                            : "bg-gray-200 text-gray-600"
                        }`}
                      >
                        {index + 1}
                      </div>

                      <div className="min-w-0">

                        <p className="truncate text-sm font-semibold text-gray-900">
                          {humanize(
                            getTopPredictionClass(item)
                          )}
                        </p>

                        <p className="mt-0.5 text-[11px] text-gray-500">
                          Rank #{index + 1}
                        </p>

                      </div>

                    </div>

                    <span
                      className={`shrink-0 text-sm font-bold ${
                        isFirst
                          ? "text-green-700"
                          : "text-gray-700"
                      }`}
                    >
                      {safeItemConfidence.toFixed(1)}%
                    </span>

                  </div>

                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200">

                    <div
                      className={`h-full rounded-full ${
                        isFirst
                          ? "bg-green-600"
                          : "bg-gray-400"
                      }`}
                      style={{
                        width: `${safeItemConfidence}%`,
                      }}
                    />

                  </div>

                </div>
              );
            })}

          </div>

        </section>
      )}

      {/* ================================================================
          DESCRIPTION
      ================================================================= */}
      {prediction.description && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">

          <div className="flex items-center gap-3">

            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50">
              <span
                className="material-symbols-outlined text-blue-600"
                style={{ fontSize: 21 }}
              >
                description
              </span>
            </div>

            <div>
              <h2 className="text-sm font-bold text-gray-900">
                Disease Description
              </h2>

              <p className="text-xs text-gray-500">
                Information associated with this prediction.
              </p>
            </div>

          </div>

          <p className="mt-4 whitespace-pre-line text-sm leading-7 text-gray-700">
            {prediction.description}
          </p>

        </section>
      )}

      {/* ================================================================
          SYMPTOMS / PREVENTION / MANAGEMENT
      ================================================================= */}
      {(symptoms.length > 0 ||
        prevention.length > 0 ||
        management.length > 0) && (

        <div className="grid gap-5 md:grid-cols-3">

          {/* Symptoms */}
          {symptoms.length > 0 && (
            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">

              <div className="flex items-center gap-3">

                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50">
                  <span
                    className="material-symbols-outlined text-red-600"
                    style={{ fontSize: 21 }}
                  >
                    warning
                  </span>
                </div>

                <h2 className="text-sm font-bold text-gray-900">
                  Symptoms
                </h2>

              </div>

              <ul className="mt-4 space-y-2.5">

                {symptoms.map((item, index) => (
                  <li
                    key={`symptom-${index}`}
                    className="flex items-start gap-2 text-sm leading-5 text-gray-700"
                  >
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                    <span>{item}</span>
                  </li>
                ))}

              </ul>

            </section>
          )}

          {/* Prevention */}
          {prevention.length > 0 && (
            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">

              <div className="flex items-center gap-3">

                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50">
                  <span
                    className="material-symbols-outlined text-blue-600"
                    style={{ fontSize: 21 }}
                  >
                    shield
                  </span>
                </div>

                <h2 className="text-sm font-bold text-gray-900">
                  Prevention
                </h2>

              </div>

              <ul className="mt-4 space-y-2.5">

                {prevention.map((item, index) => (
                  <li
                    key={`prevention-${index}`}
                    className="flex items-start gap-2 text-sm leading-5 text-gray-700"
                  >
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                    <span>{item}</span>
                  </li>
                ))}

              </ul>

            </section>
          )}

          {/* Management */}
          {management.length > 0 && (
            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">

              <div className="flex items-center gap-3">

                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-50">
                  <span
                    className="material-symbols-outlined text-green-600"
                    style={{ fontSize: 21 }}
                  >
                    healing
                  </span>
                </div>

                <h2 className="text-sm font-bold text-gray-900">
                  Management
                </h2>

              </div>

              <ul className="mt-4 space-y-2.5">

                {management.map((item, index) => (
                  <li
                    key={`management-${index}`}
                    className="flex items-start gap-2 text-sm leading-5 text-gray-700"
                  >
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
                    <span>{item}</span>
                  </li>
                ))}

              </ul>

            </section>
          )}

        </div>
      )}

      {/* ================================================================
          USER + METADATA
      ================================================================= */}
      <div className="grid gap-5 lg:grid-cols-2">

        {/* User */}
        <section className="rounded-xl border border-gray-200 bg-white shadow-sm">

          <div className="border-b border-gray-200 px-5 py-4">

            <h2 className="text-sm font-bold text-gray-900">
              User Information
            </h2>

          </div>

          <div className="grid gap-4 p-5 sm:grid-cols-2">

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Name
              </p>

              <p className="mt-1 text-sm font-medium text-gray-800">
                {prediction.user_name || "Unknown"}
              </p>
            </div>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Email
              </p>

              <p className="mt-1 break-all text-sm font-medium text-gray-800">
                {prediction.user_email || "Not available"}
              </p>
            </div>

            <div className="sm:col-span-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                User ID
              </p>

              <p className="mt-1 break-all font-mono text-xs text-gray-600">
                {prediction.user_id || "Not available"}
              </p>
            </div>

          </div>

        </section>

        {/* Metadata */}
        <section className="rounded-xl border border-gray-200 bg-white shadow-sm">

          <div className="border-b border-gray-200 px-5 py-4">

            <h2 className="text-sm font-bold text-gray-900">
              Prediction Metadata
            </h2>

          </div>

          <div className="grid gap-4 p-5 sm:grid-cols-2">

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                File Name
              </p>

              <p className="mt-1 break-all text-sm text-gray-800">
                {prediction.filename || "—"}
              </p>
            </div>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Created
              </p>

              <p className="mt-1 text-sm text-gray-800">
                {formatDate(prediction.created_at)}
              </p>
            </div>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Prediction ID
              </p>

              <p className="mt-1 break-all font-mono text-xs text-gray-600">
                {prediction.id}
              </p>
            </div>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Severity
              </p>

              <p className="mt-1 text-sm font-semibold capitalize text-gray-800">
                {humanize(prediction.severity)}
              </p>
            </div>

          </div>

        </section>

      </div>

      {/* ================================================================
          DISCLAIMER
      ================================================================= */}
      <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-5 py-4">

        <div className="flex items-start gap-3">

          <span
            className="material-symbols-outlined shrink-0 text-yellow-700"
            style={{ fontSize: 22 }}
          >
            info
          </span>

          <div>

            <p className="text-xs font-bold uppercase tracking-wide text-yellow-800">
              Important
            </p>

            <p className="mt-1 text-sm leading-6 text-yellow-800">
              WheatGuard AI provides AI-assisted screening and
              should not be treated as a confirmed agronomic
              diagnosis. Treatment decisions should be verified
              with a qualified agricultural professional.
            </p>

          </div>

        </div>

      </div>

      {/* ================================================================
          BOTTOM ACTIONS
      ================================================================= */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">

        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 18 }}
          >
            arrow_back
          </span>

          Back to Predictions
        </button>

        {prediction.user_id && (
          <button
            type="button"
            onClick={() =>
              router.push(
                `/admin/users/${encodeURIComponent(
                  prediction.user_id as string
                )}/predictions`
              )
            }
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-800 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-green-900"
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 18 }}
            >
              history
            </span>

            View User History
          </button>
        )}

      </div>

    </div>
  );
}