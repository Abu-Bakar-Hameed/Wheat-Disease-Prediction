"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  fetchAdminUserPredictions,
  type AdminPredictionLog,
} from "@/lib/api";

export default function UserPredictionsPage() {
  const params = useParams();
  const router = useRouter();

  const userId = String(params.userId ?? "");

  const [predictions, setPredictions] = useState<AdminPredictionLog[]>([]);

  const [userName, setUserName] = useState("User");
  const [userEmail, setUserEmail] = useState("");

  const [total, setTotal] = useState(0);

  const [page, setPage] = useState(1);
  const limit = 12;

  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const loadPredictions = useCallback(async () => {
    if (!userId) {
      setError("Invalid user ID.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");

      const result = await fetchAdminUserPredictions(
        userId,
        page,
        limit,
        search
      );

      setPredictions(Array.isArray(result.items) ? result.items : []);

      setUserName(result.user_name || "User");
      setUserEmail(result.user_email || "");

      setTotal(Number(result.total ?? 0));
    } catch (err) {
      console.error("Failed to load user predictions:", err);

      setPredictions([]);

      setError(
        err instanceof Error
          ? err.message
          : "Failed to load predictions."
      );
    } finally {
      setLoading(false);
    }
  }, [userId, page, limit, search]);

  useEffect(() => {
    loadPredictions();
  }, [loadPredictions]);

  const handleSearch = () => {
    setPage(1);
    setSearch(searchInput.trim());
  };

  const handleClearSearch = () => {
    setSearchInput("");
    setSearch("");
    setPage(1);
  };

  const getSeverityClass = (severity?: string) => {
    const value = String(severity ?? "").toLowerCase();

    if (
      value.includes("critical") ||
      value.includes("high")
    ) {
      return "bg-red-100 text-red-700";
    }

    if (
      value.includes("medium") ||
      value.includes("moderate")
    ) {
      return "bg-yellow-100 text-yellow-700";
    }

    if (
      value.includes("low") ||
      value.includes("healthy") ||
      value.includes("none")
    ) {
      return "bg-green-100 text-green-700";
    }

    return "bg-gray-100 text-gray-700";
  };

  const getConfidenceClass = (confidence: number) => {
    if (confidence >= 80) {
      return "text-green-700";
    }

    if (confidence >= 60) {
      return "text-yellow-700";
    }

    return "text-red-700";
  };

  const formatDate = (date: string) => {
    if (!date) return "—";

    const parsed = new Date(date);

    if (Number.isNaN(parsed.getTime())) {
      return date;
    }

    return parsed.toLocaleString();
  };

  const handleViewDetails = (predictionId: string) => {
    if (!predictionId) {
      console.error("Cannot open prediction: missing prediction ID");
      return;
    }

    router.push(
      `/admin/predictions/${encodeURIComponent(String(predictionId))}`
    );
  };

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

        <div>
          <button
            type="button"
            onClick={() => router.push("/admin/users")}
            className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-gray-500 transition hover:text-gray-900"
          >
            <span>←</span>
            <span>Back to Users</span>
          </button>

          <h1 className="text-2xl font-bold text-gray-900">
            Prediction History
          </h1>

          <p className="mt-1 text-[13px] text-gray-500">
            {userName}

            {userEmail && (
              <>
                <span className="mx-2">•</span>
                {userEmail}
              </>
            )}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white px-5 py-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Total Predictions
          </p>

          <p className="mt-1 text-2xl font-bold text-green-800">
            {total}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row">

        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSearch();
            }
          }}
          placeholder="Search disease or filename..."
          className="h-10 flex-1 rounded-lg border border-gray-300 px-3 text-sm outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-100"
        />

        <button
          type="button"
          onClick={handleSearch}
          className="h-10 rounded-lg bg-green-800 px-5 text-sm font-semibold text-white transition hover:bg-green-900"
        >
          Search
        </button>

        {search && (
          <button
            type="button"
            onClick={handleClearSearch}
            className="h-10 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Clear
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">

          <div>
            <p className="font-semibold">
              Failed to load predictions
            </p>

            <p className="mt-1">
              {error}
            </p>
          </div>

          <button
            type="button"
            onClick={loadPredictions}
            className="shrink-0 rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">

          <span
            className="material-symbols-outlined animate-spin text-green-800"
            style={{ fontSize: 36 }}
          >
            progress_activity
          </span>

          <p className="mt-3 text-sm text-gray-500">
            Loading predictions...
          </p>
        </div>
      ) : predictions.length === 0 ? (

        /* Empty */
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">

          <span
            className="material-symbols-outlined text-gray-300"
            style={{ fontSize: 52 }}
          >
            analytics
          </span>

          <h2 className="mt-3 text-base font-semibold text-gray-900">
            {search
              ? "No matching predictions"
              : "No predictions found"}
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            {search
              ? "Try a different disease name or filename."
              : "This user has not made any predictions yet."}
          </p>

          {search && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="mt-4 rounded-lg bg-green-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-green-900"
            >
              Clear Search
            </button>
          )}
        </div>
      ) : (

        /* Table */
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">

          <div className="overflow-x-auto">

            <table className="w-full min-w-[900px] text-left text-[13px]">

              <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                <tr>

                  <th className="px-4 py-3 font-semibold">
                    Image
                  </th>

                  <th className="px-4 py-3 font-semibold">
                    Disease
                  </th>

                  <th className="px-4 py-3 font-semibold">
                    Confidence
                  </th>

                  <th className="px-4 py-3 font-semibold">
                    Severity
                  </th>

                  <th className="px-4 py-3 font-semibold">
                    Date
                  </th>

                  <th className="px-4 py-3 text-right font-semibold">
                    Action
                  </th>

                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">

                {predictions.map((prediction) => {

                  const confidence = Number(
                    prediction.confidence_pct
                  );

                  const safeConfidence = Number.isFinite(confidence)
                    ? confidence
                    : 0;

                  return (
                    <tr
                      key={prediction.id}
                      className="transition hover:bg-gray-50"
                    >

                      {/* Image */}
                      <td className="px-4 py-3">

                        <div className="flex items-center gap-3">

                          {prediction.image_url ? (
                            <img
                              src={prediction.image_url}
                              alt={
                                prediction.filename ||
                                "Prediction image"
                              }
                              className="h-14 w-14 rounded-lg border border-gray-200 bg-gray-50 object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          ) : (
                            <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-gray-100">
                              <span
                                className="material-symbols-outlined text-gray-400"
                                style={{ fontSize: 24 }}
                              >
                                image
                              </span>
                            </div>
                          )}

                          <div className="min-w-0">
                            <p className="max-w-[200px] truncate font-medium text-gray-800">
                              {prediction.filename || "Unknown file"}
                            </p>

                            <p className="mt-0.5 max-w-[200px] truncate text-[11px] text-gray-400">
                              ID: {prediction.id}
                            </p>
                          </div>

                        </div>

                      </td>

                      {/* Disease */}
                      <td className="px-4 py-3">

                        <span className="font-semibold text-gray-900">
                          {prediction.predicted_class || "Unknown"}
                        </span>

                      </td>

                      {/* Confidence */}
                      <td className="px-4 py-3">

                        <div className="w-[120px]">

                          <div className="flex items-center justify-between">
                            <span
                              className={`font-semibold ${getConfidenceClass(
                                safeConfidence
                              )}`}
                            >
                              {safeConfidence.toFixed(1)}%
                            </span>
                          </div>

                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
                            <div
                              className="h-full rounded-full bg-green-600 transition-all"
                              style={{
                                width: `${Math.min(
                                  Math.max(safeConfidence, 0),
                                  100
                                )}%`,
                              }}
                            />
                          </div>

                        </div>

                      </td>

                      {/* Severity */}
                      <td className="px-4 py-3">

                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${getSeverityClass(
                            prediction.severity
                          )}`}
                        >
                          {prediction.severity || "Unknown"}
                        </span>

                      </td>

                      {/* Date */}
                      <td className="px-4 py-3 text-gray-500">
                        {formatDate(prediction.created_at)}
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3 text-right">

                        <button
                          type="button"
                          onClick={() =>
                            handleViewDetails(prediction.id)
                          }
                          disabled={!prediction.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-gray-800 shadow-sm transition hover:border-green-600 hover:bg-green-50 hover:text-green-800 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <span
                            className="material-symbols-outlined"
                            style={{ fontSize: 16 }}
                          >
                            visibility
                          </span>

                          View Details
                        </button>

                      </td>

                    </tr>
                  );
                })}

              </tbody>

            </table>

          </div>

          {/* Pagination */}
          <div className="flex flex-col gap-3 border-t border-gray-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">

            <p className="text-[12px] text-gray-500">
              Showing{" "}
              <span className="font-semibold text-gray-700">
                {total === 0
                  ? 0
                  : (page - 1) * limit + 1}
              </span>{" "}
              to{" "}
              <span className="font-semibold text-gray-700">
                {Math.min(page * limit, total)}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-gray-700">
                {total}
              </span>{" "}
              predictions
            </p>

            <div className="flex items-center gap-2">

              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() =>
                  setPage((current) =>
                    Math.max(1, current - 1)
                  )
                }
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>

              <span className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700">
                {page} / {totalPages}
              </span>

              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() =>
                  setPage((current) =>
                    Math.min(
                      totalPages,
                      current + 1
                    )
                  )
                }
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>

            </div>
          </div>

        </div>
      )}

    </div>
  );
}