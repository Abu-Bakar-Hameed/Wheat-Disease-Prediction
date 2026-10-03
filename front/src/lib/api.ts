/**
 * WheatGuard AI – Typed API Client
 * Single source of truth for every backend call.
 * Paths mirror the FastAPI routes exactly (all under /api/v1/*).
 */

import axios, { AxiosError } from "axios";
import type {
  NotificationsResponse,
  UnreadCountResponse,
  NotificationPreferences,
  NotificationItem,
} from "@/types";
import type { AppearanceSettings } from "./appearance";
import { APPEARANCE_DEFAULTS } from "./appearance";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Must match BACKEND_SESSION_KEY in lib/auth.tsx — that's where the
// access token issued by the Node/Express auth backend gets stored
// after login, registration, OTP verification, or the Google/Microsoft
// OAuth callback.
const BACKEND_SESSION_KEY = "wg_backend_session";

function getStoredAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(BACKEND_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { accessToken?: string };
    return parsed.accessToken || null;
  } catch {
    return null;
  }
}

export const apiClient = axios.create({
  baseURL: BASE,
  timeout: 90_000,
});

// Report exports (PNG / PPTX) are rendered on the server by LibreOffice,
// which has to start an office process per request. That legitimately
// takes tens of seconds, so the ordinary 90s CRUD budget is not a safe
// ceiling for them — aborting early shows the user a "failure" for a
// render that was about to finish.
const EXPORT_TIMEOUT_MS = 240_000;

// Every request to the FastAPI backend must identify which user is
// making it — without this, the backend has no way to distinguish
// one user's predictions/history/stats from another's, and every
// signed-in user ends up seeing the same (effectively random/shared)
// data.
apiClient.interceptors.request.use((config) => {
  const token = getStoredAccessToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// If the token is missing/expired/invalid, the backend will reject
// with 401. Clear the stale session so the app falls back to a
// logged-out state instead of continuing to hit the API with a dead
// token (which would otherwise keep failing silently on every call).
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      typeof window !== "undefined" &&
      axios.isAxiosError(error) &&
      error.response?.status === 401
    ) {
      localStorage.removeItem(BACKEND_SESSION_KEY);
      localStorage.removeItem("wg_backend_user");
    }
    return Promise.reject(error);
  }
);

// ── Error normalisation ───────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

function norm(err: unknown): never {
  if (axios.isAxiosError(err)) {
    if (err.code === "ECONNABORTED") {
      // The request reached the backend and never got an answer back in
      // time. That is the opposite of "server is down": reporting it as
      // unreachable sends the user off restarting services that are
      // healthy while a slow render is still running.
      throw new ApiError(
        0,
        "timeout",
        "The server is taking longer than usual to respond. It may still be " +
          "finishing this request — please try again in a moment."
      );
    }

    if (!err.response) {
      throw new ApiError(
        0,
        "network_error",
        "Cannot reach WheatGuard backend. Is the server running on " +
          BASE +
          "?"
      );
    }

    const data = err.response.data;

    const message =
      typeof data?.detail === "string"
        ? data.detail
        : typeof data?.message === "string"
        ? data.message
        : typeof data === "string"
        ? data
        : "Unexpected error. Please try again.";

    const code =
      typeof data?.error === "string"
        ? data.error
        : "unknown";

    throw new ApiError(
      err.response.status,
      code,
      message
    );
  }

  if (err instanceof Error) {
    throw new ApiError(
      0,
      "unknown",
      err.message
    );
  }

  throw new ApiError(
    0,
    "unknown",
    "Unexpected error. Please try again."
  );
}
// ── Types ─────────────────────────────────────────────────────────────────────

export interface AiDiagnosisReport {
  title: string;
  disease: string;
  confidence_pct: number;
  problem: string;
  recommendation: string;
  solution: string;
  generated_by?: string;
}

export interface HistoryItem {
  id: string;
  filename: string;
  predicted_class: string;
  confidence: number;
  confidence_pct: number;
  low_confidence: boolean;
  severity: string;
  top_predictions: Array<{ rank: number; class_name: string; confidence: number; confidence_percentage: number }>;
  recommendation: string | null;
  inference_time_ms: number | null;
  model_version: string | null;
  image_hash: string | null;
  image_url: string | null;
  gradcam_available: boolean;
  created_at: string;
  ai_report?: AiDiagnosisReport | null;
}

export interface HistoryResponse {
  items: HistoryItem[];
  total: number;
  page: number;
  limit: number;
  offset: number;
  total_pages: number;
}

export interface StatsResponse {
  total_predictions: number;
  healthy_predictions: number;
  diseased_predictions: number;
  critical_cases: number;
  average_confidence: number;
  most_common_disease: string | null;
  class_distribution: Record<string, number>;
  severity_distribution: Record<string, number>;
}

export interface PredictionResponse {
  prediction_id: string;
  prediction: string;
  confidence: number;
  confidence_percentage: number;
  confidence_level: string;
  low_confidence: boolean;
  severity: string;
  top_predictions: Array<{ rank: number; class_name: string; confidence: number; confidence_percentage: number }>;
  disease_info: {
    display_name: string;
    description: string;
    symptoms: string[];
    prevention: string[];
    management: string[];
    severity: string;
    risk_level: string;
    disclaimer: string;
  };
  recommendation: string;
  gradcam: { original: string; heatmap: string; overlay: string } | null;
  gradcam_available: boolean;
  inference_time_ms: number;
  model_version: string;
  image_url: string | null;
  ai_report?: AiDiagnosisReport | null;
  /** True when the backend handed a high-risk alert email to the mail service */
  email_queued?: boolean;
  /** True only when the mail provider confirmed it accepted the alert */
  email_sent?: boolean;
}

export interface DiseaseDetail {
  id?: string;
  name: string;
  display_name: string;
  category: string;
  description: string;
  symptoms: string;
  solution: string;
  recommendation: string;
  prevention: string;
  management: string;
  image_url: string | null;
  video_url: string | null;
  status: "active" | "inactive";
  created_at?: string;
  updated_at?: string;
}

export interface DiseasesResponse {
  diseases: DiseaseDetail[];
  total: number;
}

export interface HealthResponse {
  status: string;
  api: string;
  model: string;
  database: string;
  model_loaded: boolean;
  model_version: string;
  num_classes: number;
  device: string;
  app_version: string;
}

export interface TimeSeriesPoint { date: string; count: number; }

// Weather — v2 (disease-aware, backend-calculated). Every number here is
// produced by the scoring engine in back/app/ml/weather_service.py; the
// frontend never computes risk. Nullable fields mean "not measured / not
// available" and must render as "—", never as a guessed value.
export interface WeatherConditions {
  temperature: number | null;
  feels_like: number | null;
  humidity: number | null;
  rainfall_24h: number | null;
  wind_speed: number | null;
  wind_direction: string;
  cloud_cover: number | null;
  dew_point: number | null;
  leaf_wetness: null;
  leaf_wetness_available: boolean;
  observed_at: string;
}
export interface WeatherRiskFactor {
  name: string;
  factor_key: string;
  value: number | null;
  unit: string;
  impact: string;            // High | Moderate | Low | Unavailable
  favorability: number | null; // 0–1 suitability for this factor
  range: string;             // admin-configured favorable range, display form
}
export interface WeatherDiseaseRisk {
  disease_key: string;
  disease_name: string;
  scientific_name: string;
  weather_risk_score: number | null; // 0–100, null = not calculable
  risk_level: string;                // threshold-table level (Very Low…Very High)
  factors: WeatherRiskFactor[];
  explanation: string;
  reasons: string[];
}
export interface ForecastDiseasePoint {
  disease_key: string;
  disease_name: string;
  weather_risk_score: number | null;
  risk_level: string;
}
export interface ForecastDay {
  date: string;
  day_name: string;
  temp_high: number | null;
  temp_low: number | null;
  temp_avg: number | null;
  humidity_avg: number | null;
  rainfall: number | null;
  wind_speed: number | null;
  dew_point: number | null;
  is_today: boolean;
  per_disease: ForecastDiseasePoint[];
  highest_risk: ForecastDiseasePoint | null;
}
export interface WeatherLocationInfo {
  label: string;
  source: string; // query | profile | default
  latitude: number;
  longitude: number;
}
/** The user's own latest image prediction + its INDEPENDENT weather risk. */
export interface YourPredictionRisk {
  disease_name: string;
  model_confidence_pct: number;
  severity: string;
  predicted_at: string;
  weather_risk_score: number | null;
  weather_risk_level: string;
  explanation: string;
  factors: WeatherRiskFactor[];
  reasons: string[];
}
export interface RiskThreshold {
  level_name: string;
  min_score: number;
  max_score: number;
  display_order: number;
}
export interface WeatherRiskResponse {
  location: WeatherLocationInfo;
  current: WeatherConditions;
  disease_risks: WeatherDiseaseRisk[];
  forecast: ForecastDay[];
  alerts: string[];
  recommendations: string[];
  your_prediction?: YourPredictionRisk | null;
  risk_thresholds: RiskThreshold[];
  disclaimer: string;
  generated_at: string;
}
export interface CurrentWeatherResponse {
  location: WeatherLocationInfo;
  current: WeatherConditions;
}

// Weather — admin-managed rules
export interface WeatherFactorConfig {
  factor_key: string;
  weight: number;
  min_value: number | null;
  max_value: number | null;
  unit: string;
  explanation: string;
  active: boolean;
}
export interface WeatherProfileConfig {
  id?: string;
  disease_key: string;
  display_name: string;
  slug: string;
  description: string;
  scientific_name: string;
  active: boolean;
  display_order: number;
  factors: WeatherFactorConfig[];
  unsaved?: boolean;
  created_at?: string;
  updated_at?: string;
}

// Assistant
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  /** Optional base64 data-URL image attached by the user (Picture Upload feature). */
  image?: string;
}
export interface ChatRequest  { messages: ChatMessage[]; context?: Record<string, unknown>; }
export interface ChatResponse {
  message: ChatMessage;
  confidence: number;
  sources: string[];
  llm_enabled?: boolean;
}

// Reports
export interface ReportMetadata {
  id: string; name: string; report_type: string; format: string;
  date_generated: string; size_bytes: number; size_display: string;
}
export interface ReportGenerationRequest {
  date_range: string; report_type: string; format: string;
  start_date?: string; end_date?: string;
}
export interface ReportStatsResponse {
  total_analyses: number; healthy_samples: number;
  diseased_samples: number; average_confidence: number;
}

// Admin
export interface AdminStats {
  total_users: number; active_agronomists: number; global_inferences: number;
  validation_accuracy: number; mean_latency_ms: number; model_version: string;
  uptime_pct: number; total_predictions: number; healthy_predictions: number;
  diseased_predictions: number; critical_cases: number; average_confidence: number;
  disease_types?: number; system_logs?: number;
}
export interface AdminDashboard {
  total_users: number;
  total_crops?: number;
  total_diseases?: number;
  total_diagnoses?: number;
  total_predictions: number;
  disease_types: number;
  system_logs: number;
  weekly: Array<{ day: string; predictions: number; diseased: number }>;
  distribution: Array<{ name: string; value: number }>;
  recent: Array<{
    id: string; image_url: string | null; crop_name?: string; disease: string;
    date: string; result?: string; confidence_pct: number;
  }>;
}
export interface AdminCrop {
  id: string; name: string; description: string;
  image_url: string | null; status: string; created_at?: string;
}
export interface AdminUser {
  id: string; initials: string; name: string; email: string; role: string;
  organization: string; quota_used: number; quota_total: number; status: string;
  created_at?: string;
  avatar_url?: string | null;
}
export interface AdminDisease {
  id: string;
  name: string;
  display_name: string;
  category: string;
  description: string;
  symptoms: string;
  solution: string;
  recommendation: string;
  prevention: string;
  management: string;
  image_url: string | null;
  video_url: string | null;
  status: "active" | "inactive";
  created_at?: string;
  updated_at?: string;
}
export interface AdminInfoItem {
  id: string; disease_name: string; caption: string; image_url: string;
  category: string; created_at?: string;
}
export interface AdminSettings {
  site_title: string; support_email: string; language: string;
  email_notifications: boolean; push_notifications: boolean;
  system_alerts?: boolean; description?: string;
  username: string; admin_email: string;
  // ── Alert notifications ───────────────────────────────────────────────────
  email_alerts_enabled?: boolean;
  alert_severity_threshold?: "medium" | "high" | "critical";
  cc_admin_on_alert?: boolean;
  admin_notify_email?: string;
  // ── Detection defaults ────────────────────────────────────────────────────
  low_confidence_threshold_pct?: number;
  default_top_k?: 3 | 5;
  // ── System ────────────────────────────────────────────────────────────────
  maintenance_mode?: boolean;
}
export interface AdminPredictionLog {
  id: string;
  filename: string;
  image_url: string | null;
  predicted_class: string;
  confidence_pct: number;
  created_at: string;
  severity: string;
  recommendation: string | null;
  top_predictions: Array<Record<string, unknown>>;
  symptoms?: string[];
  prevention?: string[];
  management?: string[];
  description?: string;

  // User information
  user_id?: string | null;
  user_name?: string | null;
  user_email?: string | null;
}

export interface AdminUserPredictionsResponse {
  user_id: string;
  user_name: string;
  user_email: string;
  items: AdminPredictionLog[];
  total: number;
  page: number;
  limit: number;
}
export interface AuditLog {
  id?: string; timestamp: string; level: string; message: string;
  event_type?: string; status?: string; actor?: string | null;
  details?: Record<string, unknown>; image_url?: string | null;
}

// ── Health ────────────────────────────────────────────────────────────────────

export async function fetchHealth(): Promise<HealthResponse> {
  try { const { data } = await apiClient.get<HealthResponse>("/health"); return data; }
  catch (e) { norm(e); }
}

// ── Prediction ────────────────────────────────────────────────────────────────

export async function predictImage(
  file: File,
  opts: {
    includeGradcam?: boolean;
    topK?: number;
    saveHistory?: boolean;
    storeImage?: boolean;
    onProgress?: (pct: number) => void;
  } = {}
): Promise<PredictionResponse> {
  // When the caller doesn't override them, honour the user's Settings →
  // Prediction switches ("save predictions automatically" / "keep original
  // images"). Read the synchronous cache so this works without an await.
  const prefs = getCachedUserSettings().prediction_preferences;
  const form = new FormData();
  form.append("file", file);
  form.append("include_gradcam", String(opts.includeGradcam ?? true));
  form.append("top_k", String(opts.topK ?? 3));
  form.append("save_history", String(opts.saveHistory ?? prefs.save_auto));
  form.append("store_image", String(opts.storeImage ?? prefs.save_images));
  try {
    const { data } = await apiClient.post<PredictionResponse>("/api/v1/predict", form, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (e) => {
        if (opts.onProgress && e.total) opts.onProgress(Math.round(e.loaded * 100 / e.total));
      },
    });
    return data;
  } catch (e) { norm(e); }
}

// ── History ───────────────────────────────────────────────────────────────────

export async function fetchHistory(p: {
  page?: number; limit?: number; disease?: string;
  severity?: string; search?: string; sort?: string;
} = {}): Promise<HistoryResponse> {
  try {
    const { data } = await apiClient.get<HistoryResponse>("/api/v1/history", {
      params: { page: p.page ?? 1, limit: p.limit ?? 20,
        ...(p.disease  ? { disease:  p.disease  } : {}),
        ...(p.severity ? { severity: p.severity } : {}),
        ...(p.search   ? { search:   p.search   } : {}),
        ...(p.sort     ? { sort:     p.sort     } : {}),
      },
    });
    return data;
  } catch (e) { norm(e); }
}

export async function fetchStats(): Promise<StatsResponse> {
  try { const { data } = await apiClient.get<StatsResponse>("/api/v1/history/stats"); return data; }
  catch (e) { norm(e); }
}

export async function fetchHistoryItem(id: string): Promise<HistoryItem> {
  try { const { data } = await apiClient.get<HistoryItem>(`/api/v1/history/${id}`); return data; }
  catch (e) { norm(e); }
}

export async function deleteHistoryItem(id: string): Promise<void> {
  try { await apiClient.delete(`/api/v1/history/${id}`); }
  catch (e) { norm(e); }
}

/* ── Public share links (FastAPI /api/v1/share) ──────────────────────────
   Tokens are generated server-side (secrets.token_urlsafe) and are
   unrelated to the prediction UUID — the public URL never exposes the
   private row id. Opening a share link idempotently re-activates an
   existing token, so previously distributed links keep working.          */

export interface ShareLinkResponse {
  share_token: string;
  share_enabled: boolean;
}

export interface ShareStatusResponse {
  share_enabled: boolean;
  share_token: string | null;
}

export async function createShareLink(predictionId: string): Promise<ShareLinkResponse> {
  try {
    const { data } = await apiClient.post<ShareLinkResponse>("/api/v1/share", {
      prediction_id: predictionId,
    });
    return data;
  } catch (e) { norm(e); }
}

export async function disableShareLink(predictionId: string): Promise<ShareStatusResponse> {
  try {
    const { data } = await apiClient.delete<ShareStatusResponse>(
      `/api/v1/share/${predictionId}`
    );
    return data;
  } catch (e) { norm(e); }
}

/** One of the caller's currently-shared predictions (Privacy → Manage shared reports). */
export interface SharedLinkItem {
  prediction_id: string;
  predicted_class: string;
  confidence_pct: number | null;
  created_at: string | null;
  share_token: string;
}

/** List the current user's active public share links. */
export async function fetchMySharedLinks(): Promise<SharedLinkItem[]> {
  try {
    const { data } = await apiClient.get<{ items: SharedLinkItem[] }>(
      "/api/v1/share/mine"
    );
    return data?.items ?? [];
  } catch {
    return [];
  }
}

/** Download the caller's full account data (profile + settings + history). */
export async function exportAccountData(): Promise<Record<string, unknown>> {
  try {
    const { data } = await apiClient.get<Record<string, unknown>>(
      "/api/v1/users/me/export"
    );
    return data;
  } catch (e) { norm(e); }
}

export async function fetchTimeSeries(days = 30): Promise<TimeSeriesPoint[]> {
  try {
    const { data } = await apiClient.get<TimeSeriesPoint[]>("/api/v1/history/timeseries", { params: { days } });
    return data;
  } catch { return []; }
}

// ── Diseases ──────────────────────────────────────────────────────────────────

export async function fetchDiseases(): Promise<DiseasesResponse> {
  try { const { data } = await apiClient.get<DiseasesResponse>("/api/v1/diseases"); return data; }
  catch (e) { norm(e); }
}

// ── Weather ───────────────────────────────────────────────────────────────────
// Optional `location` text is geocoded server-side; on provider failure these
// throw with the backend message ("Weather data is currently unavailable.")
// so the UI can show the real error state — never fake numbers.

export async function fetchWeatherRisk(
  location?: string
): Promise<WeatherRiskResponse> {
  try {
    const { data } = await apiClient.get<WeatherRiskResponse>(
      "/api/v1/weather/risk",
      { params: location ? { location } : undefined }
    );
    return data;
  } catch (e) { norm(e); }
}

export async function fetchCurrentWeather(
  location?: string
): Promise<CurrentWeatherResponse> {
  try {
    const { data } = await apiClient.get<CurrentWeatherResponse>(
      "/api/v1/weather/current",
      { params: location ? { location } : undefined }
    );
    return data;
  } catch (e) { norm(e); }
}

// ── Weather risk rules (admin) ────────────────────────────────────────────────

export async function fetchWeatherProfiles(): Promise<WeatherProfileConfig[]> {
  try {
    const { data } = await apiClient.get<{ profiles: WeatherProfileConfig[] }>(
      "/api/v1/admin/weather/profiles"
    );
    return data.profiles;
  } catch (e) { norm(e); }
}

export async function saveWeatherProfile(
  diseaseKey: string,
  body: Omit<WeatherProfileConfig, "id" | "disease_key" | "created_at" | "updated_at" | "unsaved">
): Promise<WeatherProfileConfig> {
  try {
    const { data } = await apiClient.put<{ profile: WeatherProfileConfig }>(
      `/api/v1/admin/weather/profiles/${encodeURIComponent(diseaseKey)}`,
      body
    );
    return data.profile;
  } catch (e) { norm(e); }
}

export async function fetchWeatherThresholds(): Promise<RiskThreshold[]> {
  try {
    const { data } = await apiClient.get<{ thresholds: RiskThreshold[] }>(
      "/api/v1/admin/weather/thresholds"
    );
    return data.thresholds;
  } catch (e) { norm(e); }
}

export async function saveWeatherThresholds(
  rows: RiskThreshold[]
): Promise<RiskThreshold[]> {
  try {
    const { data } = await apiClient.put<{ thresholds: RiskThreshold[] }>(
      "/api/v1/admin/weather/thresholds",
      rows
    );
    return data.thresholds;
  } catch (e) { norm(e); }
}

// ── Assistant ─────────────────────────────────────────────────────────────────

export async function sendChat(req: ChatRequest): Promise<ChatResponse> {
  try { const { data } = await apiClient.post<ChatResponse>("/api/v1/assistant/chat", req); return data; }
  catch (e) { norm(e); }
}

export async function fetchSuggestedQuestions(): Promise<string[]> {
  try { const { data } = await apiClient.get<string[]>("/api/v1/assistant/suggested"); return data; }
  catch { return []; }
}

export async function regenerateDiagnosisReport(predictionId: string): Promise<AiDiagnosisReport> {
  try {
    const { data } = await apiClient.post<AiDiagnosisReport>(
      `/api/v1/assistant/diagnosis-report/${predictionId}`
    );
    return data;
  } catch (e) { norm(e); }
}

export async function generateDiagnosisReport(req: {
  disease: string;
  confidence_pct: number;
  severity?: string;
  recommendation?: string;
}): Promise<AiDiagnosisReport> {
  try {
    const { data } = await apiClient.post<AiDiagnosisReport>("/api/v1/assistant/diagnosis-report", req);
    return data;
  } catch (e) { norm(e); }
}

// ── Reports ───────────────────────────────────────────────────────────────────
// ── Reports ───────────────────────────────────────────────────────────────────

export async function fetchReportList(): Promise<{
  reports: ReportMetadata[];
  total: number;
}> {
  try {
    const { data } = await apiClient.get("/api/v1/reports/list");
    return data;
  } catch (e) {
    norm(e);
  }
}

export async function fetchReportStats(): Promise<ReportStatsResponse> {
  try {
    const { data } = await apiClient.get<ReportStatsResponse>(
      "/api/v1/reports/stats"
    );
    return data;
  } catch (e) {
    norm(e);
  }
}

export async function generateReport(
  req: ReportGenerationRequest
): Promise<Blob> {
  try {
    const { data } = await apiClient.post(
      "/api/v1/reports/generate",
      req,
      {
        responseType: "blob",
      }
    );
    return data;
  } catch (e) {
    norm(e);
  }
}

export async function generatePptxReport(req: {
  date_range?: string;
  report_type?: string;
  limit?: number;
} = {}): Promise<Blob> {
  try {
    const { data } = await apiClient.post(
      "/api/v1/reports/pptx",
      {
        date_range: req.date_range ?? "last-30-days",
        report_type: req.report_type ?? "all",
        limit: req.limit ?? 50,
      },
      {
        responseType: "blob",
      }
    );

    return data;
  } catch (e) {
    norm(e);
  }
}

export async function generateSinglePptx(
  predictionId: string
): Promise<Blob> {
  try {
    const { data } = await apiClient.get(
      `/api/v1/reports/pptx/single/${predictionId}`,
      {
        responseType: "blob",
        timeout: EXPORT_TIMEOUT_MS,
      }
    );

    return data;
  } catch (e) {
    norm(e);
  }
}

export async function generateSingleImage(
  predictionId: string
): Promise<Blob> {
  try {
    const { data } = await apiClient.get(
      `/api/v1/reports/image/single/${encodeURIComponent(predictionId)}`,
      {
        responseType: "blob",
        timeout: EXPORT_TIMEOUT_MS,
      }
    );

    return data;
  } catch (e) {
    const ax = axios.isAxiosError(e) ? e : null;
    const status = ax?.response?.status;

    // Logged as plain values on purpose: the response body here is a Blob,
    // so dumping the error object renders as an unusable `{}` in the
    // console (which is exactly what made this failure hard to read).
    console.error(
      `generateSingleImage failed (prediction=${predictionId}, status=${status ?? "no response"})`,
      e instanceof Error ? e.message : e
    );

    // Axios returns the backend error as a Blob because this request
    // uses responseType: "blob". Convert it to readable text.
    if (ax?.response?.data instanceof Blob) {
      try {
        const text = await ax.response.data.text();

        console.error(
          "Backend image export response:",
          text
        );

        let parsed: { detail?: string; message?: string } | null = null;

        try {
          parsed = JSON.parse(text);
        } catch {
          // Not JSON
        }

        throw new Error(
          parsed?.detail ||
          parsed?.message ||
          text ||
          `Image export failed (${status ?? "unknown"})`
        );
      } catch (blobError) {
        if (blobError instanceof Error) {
          throw blobError;
        }
      }
    }

    // Nothing readable came back (never reached the backend, or the render
    // outlived the export budget). `norm` turns that into a plain-language
    // ApiError instead of leaking "timeout of 240000ms exceeded" to the UI.
    norm(e);
  }
}
// ── Admin ─────────────────────────────────────────────────────────────────────

export async function fetchAdminStats(): Promise<AdminStats> {
  try { const { data } = await apiClient.get<AdminStats>("/api/v1/admin/stats"); return data; }
  catch (e) { norm(e); }
}

export async function fetchAdminDashboard(): Promise<AdminDashboard> {
  try { const { data } = await apiClient.get<AdminDashboard>("/api/v1/admin/dashboard"); return data; }
  catch (e) { norm(e); }
}

export async function fetchAdminUsers(page = 1, limit = 10, search = ""): Promise<{ users: AdminUser[]; total: number; page: number; limit: number }> {
  try {
    const { data } = await apiClient.get("/api/v1/admin/users", { params: { page, limit, search } });
    return data;
  } catch (e) { norm(e); }
}

export async function createAdminUser(body: { name: string; email: string; role: string; status: string; password?: string }): Promise<AdminUser> {
  try { const { data } = await apiClient.post("/api/v1/admin/users", body); return data; }
  catch (e) { norm(e); }
}

export async function updateAdminUser(id: string, body: Partial<{ name: string; email: string; role: string; status: string }>): Promise<AdminUser> {
  try { const { data } = await apiClient.patch(`/api/v1/admin/users/${id}`, body); return data; }
  catch (e) { norm(e); }
}

export async function deleteAdminUser(id: string): Promise<void> {
  try { await apiClient.delete(`/api/v1/admin/users/${id}`); }
  catch (e) { norm(e); }
}

export async function fetchAdminCrops(page = 1, limit = 10, search = ""): Promise<{ crops: AdminCrop[]; total: number; page: number; limit: number }> {
  try {
    const { data } = await apiClient.get("/api/v1/admin/crops", { params: { page, limit, search } });
    return data;
  } catch (e) { norm(e); }
}

export async function saveAdminCrop(form: FormData, id?: string): Promise<AdminCrop> {
  try {
    const { data } = id
      ? await apiClient.patch(`/api/v1/admin/crops/${id}`, form)
      : await apiClient.post("/api/v1/admin/crops", form);
    return data;
  } catch (e) { norm(e); }
}

export async function deleteAdminCrop(id: string): Promise<void> {
  try { await apiClient.delete(`/api/v1/admin/crops/${id}`); }
  catch (e) { norm(e); }
}

export async function fetchAdminDiseases(search = ""): Promise<{ diseases: AdminDisease[]; total: number }> {
  try {
    const { data } = await apiClient.get("/api/v1/admin/diseases", { params: { search } });
    return data;
  } catch (e) { norm(e); }
}

export async function saveAdminDisease(form: FormData, id?: string): Promise<AdminDisease> {
  try {
    const { data } = id
      ? await apiClient.patch(`/api/v1/admin/diseases/${id}`, form)
      : await apiClient.post("/api/v1/admin/diseases", form);
    return data;
  } catch (e) { norm(e); }
}

export async function deleteAdminDisease(id: string): Promise<void> {
  try { await apiClient.delete(`/api/v1/admin/diseases/${id}`); }
  catch (e) { norm(e); }
}

export async function fetchAdminInformation(category = "All"): Promise<{ items: AdminInfoItem[]; total: number }> {
  try {
    const { data } = await apiClient.get("/api/v1/admin/information", { params: { category } });
    return data;
  } catch (e) { norm(e); }
}

export async function uploadAdminInformation(form: FormData): Promise<AdminInfoItem> {
  try { const { data } = await apiClient.post("/api/v1/admin/information", form); return data; }
  catch (e) { norm(e); }
}

export async function deleteAdminInformation(id: string): Promise<void> {
  try { await apiClient.delete(`/api/v1/admin/information/${id}`); }
  catch (e) { norm(e); }
}

export async function fetchAdminPredictions(page = 1, limit = 12, search = ""): Promise<{ items: AdminPredictionLog[]; total: number; page: number; limit: number }> {
  try {
    const { data } = await apiClient.get("/api/v1/admin/predictions", { params: { page, limit, search } });
    return data;
  } catch (e) { norm(e); }
}

export async function fetchAdminPrediction(id: string): Promise<AdminPredictionLog> {
  try { const { data } = await apiClient.get(`/api/v1/admin/predictions/${id}`); return data; }
  catch (e) { norm(e); }
}

export async function fetchAdminUserPredictions(
  userId: string,
  page = 1,
  limit = 12,
  search = ""
): Promise<AdminUserPredictionsResponse> {
  if (!userId) {
    throw new ApiError(
      400,
      "invalid_user_id",
      "User ID is required."
    );
  }

  try {
    const { data } = await apiClient.get<AdminUserPredictionsResponse>(
      `/api/v1/admin/users/${encodeURIComponent(userId)}/predictions`,
      {
        params: {
          page,
          limit,
          ...(search.trim()
            ? { search: search.trim() }
            : {}),
        },
      }
    );

    return {
      user_id: data.user_id ?? userId,
      user_name: data.user_name ?? "User",
      user_email: data.user_email ?? "",
      items: Array.isArray(data.items) ? data.items : [],
      total: Number(data.total ?? 0),
      page: Number(data.page ?? page),
      limit: Number(data.limit ?? limit),
    };
  } catch (e) {
    norm(e);
  }
}

export async function deleteAdminPrediction(id: string): Promise<void> {
  try { await apiClient.delete(`/api/v1/admin/predictions/${id}`); }
  catch (e) { norm(e); }
}

export async function fetchAdminSettings(): Promise<AdminSettings> {
  try { const { data } = await apiClient.get("/api/v1/admin/settings"); return data; }
  catch (e) { norm(e); }
}

export async function saveAdminSettings(body: AdminSettings): Promise<AdminSettings> {
  try { const { data } = await apiClient.put("/api/v1/admin/settings", body); return data; }
  catch (e) { norm(e); }
}

/** PATCH variant — sends only the fields you pass, leaves others unchanged. */
export async function updateAdminSettings(input: Partial<AdminSettings>): Promise<AdminSettings> {
  try {
    // Backend supports PATCH; fall back to a GET+PUT merge if it doesn't
    try {
      const { data } = await apiClient.patch("/api/v1/admin/settings", input);
      return data;
    } catch {
      // Backend may not have PATCH — merge with current and PUT
      const current = await fetchAdminSettings();
      return saveAdminSettings({ ...current, ...input });
    }
  } catch (e) { norm(e); }
}

// ── User Settings ─────────────────────────────────────────────────────────────

export interface PredictionPreferences {
  default_method: string;
  save_auto: boolean;
  save_images: boolean;
  show_gradcam: boolean;
  show_top: boolean;
  show_ai_report: boolean;
  low_confidence_warning: boolean;
  open_result_auto: boolean;
}

export interface WeatherPreferences {
  notify_weather_risk: boolean;
  notify_disease_risk: boolean;
  high_risk_alerts: boolean;
  forecast_period: string;
  show_on_dashboard: boolean;
}

export interface CalendarPreferences {
  reminders_enabled: boolean;
  in_app: boolean;
  email: boolean;
  default_lead_time: string;
  suggest_prediction_followup: boolean;
  suggest_weather_followup: boolean;
  default_view: string;
}

/** Reserved container — the Privacy & Data section is action-based, not toggle-
 *  based, so there are no user-facing switches backed by this today. */
export type PrivacyPreferences = Record<string, unknown>;

export interface UserSettings {
  email_high_severity_alerts?: boolean;
  email_weekly_digest?: boolean;
  email_report_ready?: boolean;
  units?: "metric" | "imperial";
  language?: string;
  // Appearance (single nested object persisted as one JSONB column)
  appearance?: AppearanceSettings;
  // Built-in assistant feature availability (enforced client + server side)
  voice_enabled?: boolean;
  image_upload_enabled?: boolean;
  recent_predictions_enabled?: boolean;
  chat_notifications_enabled?: boolean;
  // General: locale / formatting / navigation (flat scalar columns)
  timezone?: string | null;
  date_format?: string;
  time_format?: string;
  first_day_of_week?: string;
  default_start_page?: string;
  remember_last_page?: boolean;
  show_help_tips?: boolean;
  last_visited_page?: string | null;
  // Per-feature preference groups (each persisted as one JSONB column)
  prediction_preferences?: PredictionPreferences;
  weather_preferences?: WeatherPreferences;
  calendar_preferences?: CalendarPreferences;
  privacy_preferences?: PrivacyPreferences;
  // AI Chatbot account integrations + security state (Settings → Chatbot /
  // Security). The OpenRouter key itself is NEVER returned — only the masked
  // `openrouter_key_configured` flag — so a settings GET can't leak the secret.
  chat_model?: string;
  openrouter_key_configured?: boolean;
  two_factor_enabled?: boolean;
  // Write-only: send a key to store (empty string clears it). Not in responses.
  openrouter_api_key?: string | null;
}

const USER_SETTINGS_KEY = "wg_user_settings_cache";

/**
 * Fired on `window` whenever the user's settings are saved or re-fetched so
 * already-mounted surfaces (the assistant panel, the applied theme/accent)
 * can update immediately without a rebuild or reload.
 */
export const USER_SETTINGS_EVENT = "wg:settings-updated";

export const PREDICTION_PREF_DEFAULTS: PredictionPreferences = {
  default_method: "standard",
  save_auto: true,
  save_images: true,
  show_gradcam: true,
  show_top: true,
  show_ai_report: true,
  low_confidence_warning: true,
  open_result_auto: true,
};

export const WEATHER_PREF_DEFAULTS: WeatherPreferences = {
  notify_weather_risk: true,
  notify_disease_risk: true,
  high_risk_alerts: true,
  forecast_period: "7d",
  show_on_dashboard: true,
};

export const CALENDAR_PREF_DEFAULTS: CalendarPreferences = {
  reminders_enabled: true,
  in_app: true,
  // Default TRUE to match the backend and, crucially, today's real behaviour
  // (reminders e-mail), so wiring the toggle never silently switches a
  // user's existing e-mails off. The value is only persisted when changed.
  email: true,
  default_lead_time: "1d",
  suggest_prediction_followup: true,
  suggest_weather_followup: true,
  default_view: "monthly",
};

const USER_SETTINGS_DEFAULTS: Required<UserSettings> = {
  email_high_severity_alerts: true,
  email_weekly_digest: false,
  email_report_ready: true,
  units: "metric",
  language: "en",
  appearance: APPEARANCE_DEFAULTS,
  voice_enabled: true,
  image_upload_enabled: true,
  recent_predictions_enabled: true,
  chat_notifications_enabled: true,
  timezone: null,
  date_format: "DD/MM/YYYY",
  time_format: "24",
  first_day_of_week: "monday",
  default_start_page: "/dashboard",
  remember_last_page: false,
  show_help_tips: true,
  last_visited_page: null,
  prediction_preferences: PREDICTION_PREF_DEFAULTS,
  weather_preferences: WEATHER_PREF_DEFAULTS,
  calendar_preferences: CALENDAR_PREF_DEFAULTS,
  privacy_preferences: {},
  chat_model: "",
  openrouter_key_configured: false,
  two_factor_enabled: false,
  openrouter_api_key: null,
};

/**
 * Synchronous read of the last-known settings from localStorage merged over
 * defaults. Used as the instant source when a component mounts before the
 * network fetch resolves.
 */
export function getCachedUserSettings(): Required<UserSettings> {
  if (typeof window === "undefined") return { ...USER_SETTINGS_DEFAULTS };
  try {
    const cached = localStorage.getItem(USER_SETTINGS_KEY);
    if (cached) return { ...USER_SETTINGS_DEFAULTS, ...JSON.parse(cached) };
  } catch {}
  return { ...USER_SETTINGS_DEFAULTS };
}

function _broadcastSettings(settings: UserSettings) {
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent(USER_SETTINGS_EVENT, { detail: settings }));
    } catch {}
  }
}

export async function fetchUserSettings(): Promise<UserSettings> {
  try {
    const { data } = await apiClient.get<UserSettings>("/api/v1/users/me/settings");
    const merged = { ...USER_SETTINGS_DEFAULTS, ...data };
    if (typeof window !== "undefined") {
      try { localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(merged)); } catch {}
    }
    _broadcastSettings(merged);
    return merged;
  } catch {
    // Offline / server-not-running fallback — return cached value
    const cached = getCachedUserSettings();
    return cached;
  }
}

export async function updateUserSettings(input: UserSettings): Promise<UserSettings> {
  try {
    const { data } = await apiClient.patch<UserSettings>("/api/v1/users/me/settings", input);
    const merged = { ...USER_SETTINGS_DEFAULTS, ...data };
    if (typeof window !== "undefined") {
      try { localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(merged)); } catch {}
    }
    _broadcastSettings(merged);
    return merged;
  } catch (e) { norm(e); }
}

export async function fetchAuditLogs(limit = 50): Promise<{ logs: AuditLog[]; total: number }> {
  try {
    const { data } = await apiClient.get("/api/v1/admin/audit-logs", { params: { limit } });
    return data;
  } catch (e) { norm(e); }
}

// Real model evaluation metrics (accuracy/precision/recall/f1). Uses the public
// /model/metrics endpoint — NOT the admin-gated /admin/model-card, which returns
// 401 for a normal user's dashboard and left the performance card blank.
export async function fetchModelCard(): Promise<Record<string, unknown>> {
  try { const { data } = await apiClient.get("/api/v1/model/metrics"); return data; }
  catch (e) { norm(e); }
}

// ── Notifications ─────────────────────────────────────────────────────────────

// Notifications, preferences and admin broadcasts are owned by the
// Node/Express auth service (it writes the `notifications` table and shares
// the same Bearer JWT), NOT FastAPI. Base is derived from
// NEXT_PUBLIC_AUTH_API_URL the same way supportApi.ts / feedbackApi.ts do it.
const AUTH_BASE = (process.env.NEXT_PUBLIC_AUTH_API_URL ?? "http://localhost:5000/api/auth")
  .trim()
  .replace(/\/$/, "")
  .replace(/\/api\/auth\/?$/, "");

const authClient = axios.create({
  baseURL: AUTH_BASE,
  timeout: 30_000,
});

authClient.interceptors.request.use((config) => {
  const token = getStoredAccessToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/** Map auth-service rows (message / is_read / action_url) onto the bell's shape. */
function mapNotificationRow(row: NotificationItem): NotificationItem {
  const r = row as NotificationItem & {
    message?: string;
    is_read?: boolean;
    action_url?: string | null;
  };
  return {
    ...r,
    body: r.body ?? r.message ?? "",
    read: r.read ?? Boolean(r.is_read),
    link: r.link ?? r.action_url ?? null,
  };
}

export async function fetchNotifications(limit = 20, offset = 0): Promise<NotificationsResponse> {
  try {
    const page = Math.floor(offset / Math.max(1, limit)) + 1;
    const { data } = await authClient.get<NotificationsResponse & { success: boolean }>(
      "/api/notifications",
      { params: { limit, page } }
    );
    const rows = data?.notifications ?? data?.items ?? [];
    const items = rows.map(mapNotificationRow);
    // The service exposes the badge count on its own endpoint; derive it
    // from the loaded page as a fallback so the badge never collapses to 0.
    const unread =
      typeof data?.unread === "number"
        ? data.unread
        : items.filter((n) => !n.read).length;
    return { ...data, items, notifications: items, unread };
  } catch (e) { return norm(e); }
}

export async function fetchUnreadCount(): Promise<UnreadCountResponse> {
  try {
    const { data } = await authClient.get<{ success: boolean; count: number }>(
      "/api/notifications/unread-count"
    );
    return { count: data?.count ?? 0 };
  } catch (e) { return norm(e); }
}

export async function markNotificationRead(id: string): Promise<void> {
  try { await authClient.patch(`/api/notifications/${id}/read`); }
  catch (e) { norm(e); }
}

export async function markAllNotificationsRead(): Promise<void> {
  try { await authClient.patch("/api/notifications/read-all"); }
  catch (e) { norm(e); }
}

/** Delete one notification (auth service scopes ownership from the JWT). */
export async function deleteNotificationItem(id: string): Promise<void> {
  try { await authClient.delete(`/api/notifications/${id}`); }
  catch (e) { norm(e); }
}

/** Delete every notification of the current user. The backend requires the
 *  X-Confirm-Delete header as an explicit confirmation for this bulk action. */
export async function clearAllNotifications(): Promise<void> {
  try {
    await authClient.delete("/api/notifications", { headers: { "X-Confirm-Delete": "clear-all" } });
  } catch (e) { norm(e); }
}

export async function fetchNotificationPreferences(): Promise<NotificationPreferences> {
  try {
    const { data } = await authClient.get<{ success: boolean; preferences: Record<string, boolean> }>(
      "/api/notifications/preferences"
    );
    const p = data?.preferences ?? (data as unknown as Record<string, boolean>) ?? {};
    // Map backend columns → user-facing keys
    return {
      high_risk:        p.email_security  ?? p.security_alerts ?? true,
      daily_digest:     p.email_account   ?? p.account_alerts  ?? true,
      weekly_email:     p.email_system    ?? p.system_alerts   ?? false,
      weather_warnings: p.email_admin     ?? p.admin_alerts    ?? true,
      // Pass through full backend columns for completeness
      login_alerts:    p.login_alerts,
      security_alerts: p.security_alerts,
      password_alerts: p.password_alerts,
      account_alerts:  p.account_alerts,
      system_alerts:   p.system_alerts,
      admin_alerts:    p.admin_alerts,
      email_enabled:   p.email_enabled,
      email_login:     p.email_login,
      email_security:  p.email_security,
      email_password:  p.email_password,
      email_account:   p.email_account,
      email_system:    p.email_system,
      email_admin:     p.email_admin,
    };
  } catch (e) { return norm(e); }
}

export async function saveNotificationPreferences(
  prefs: NotificationPreferences
): Promise<NotificationPreferences> {
  try {
    // Map user-facing keys → backend columns
    const payload: Record<string, boolean> = {
      security_alerts: prefs.high_risk,
      email_security:  prefs.high_risk,
      account_alerts:  prefs.daily_digest,
      email_account:   prefs.daily_digest,
      system_alerts:   prefs.weather_warnings,
      admin_alerts:    prefs.weather_warnings,
      email_system:    prefs.weekly_email,
      email_admin:     prefs.weather_warnings,
    };
    // Also pass any explicit backend columns the caller set
    const passThrough: Array<keyof NotificationPreferences> = [
      "login_alerts","password_alerts","email_enabled",
      "email_login","email_password",
    ];
    for (const k of passThrough) {
      if (typeof prefs[k] === "boolean") payload[k as string] = prefs[k] as boolean;
    }
    const { data } = await authClient.put<{ success: boolean; preferences: Record<string, boolean> }>(
      "/api/notifications/preferences",
      payload
    );
    return fetchNotificationPreferences();
  } catch (e) { return norm(e); }
}

export async function broadcastNotification(payload: {
  title: string;
  body: string;
  user_ids?: string[];
}): Promise<{ created: number }> {
  try {
    // Auth service expects `message` (not `body`) and lives under
    // /api/admin/notifications on the Node backend.
    const { data } = await authClient.post("/api/admin/notifications/broadcast", {
      title: payload.title,
      message: payload.body,
    });
    return data;
  } catch (e) { return norm(e); }
}

export type { NotificationItem, NotificationsResponse, UnreadCountResponse, NotificationPreferences };

// ── User Preferences (localization / detection defaults) ──────────────────────

export interface UserPreferences {
  language: string;
  measurement: string;
  confidence_threshold: number;   // numeric 0–100
  scan_quality: string;
}

const DEFAULT_USER_PREFS: UserPreferences = {
  language: "en",
  measurement: "metric",
  confidence_threshold: 70,
  scan_quality: "standard",
};

const USER_PREFS_KEY = "wg_user_prefs_cache";

export async function fetchUserPreferences(): Promise<UserPreferences> {
  try {
    const { data } = await apiClient.get<UserPreferences>("/api/v1/preferences");
    if (typeof window !== "undefined") {
      try { localStorage.setItem(USER_PREFS_KEY, JSON.stringify(data)); } catch {}
    }
    return data;
  } catch {
    // Offline fallback — read from cache
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem(USER_PREFS_KEY);
        if (cached) return JSON.parse(cached);
      } catch {}
    }
    return DEFAULT_USER_PREFS;
  }
}

export async function saveUserPreferences(prefs: Partial<UserPreferences>): Promise<UserPreferences> {
  try {
    const { data } = await apiClient.put<UserPreferences>("/api/v1/preferences", prefs);
    if (typeof window !== "undefined") {
      try { localStorage.setItem(USER_PREFS_KEY, JSON.stringify(data)); } catch {}
    }
    return data;
  } catch (e) { return norm(e); }
}

// ── User Profile ──────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string | number;
  email: string;
  full_name?: string;
  phone?: string;
  farm_name?: string;
  location?: string;
  bio?: string;
  avatar_url?: string | null;
  member_since?: string;
  total_scans?: number;
  high_severity_count?: number;
}

/**
 * Fetch the current user's profile.
 * Tries /api/v1/users/me first; falls back to building from auth session
 * so the modal always has *something* to show even if the backend endpoint
 * doesn't exist yet.
 */
export async function fetchUserProfile(): Promise<UserProfile> {
  try {
    const { data } = await apiClient.get<UserProfile>("/api/v1/users/me");
    return data;
  } catch {
    // Graceful fallback: reconstruct from the stored auth session so the
    // modal at least shows name + email without crashing.
    try {
      const raw = typeof window !== "undefined"
        ? localStorage.getItem("wg_backend_user")
        : null;
      if (raw) {
        const u = JSON.parse(raw) as {
          id?: string; email?: string; name?: string;
          organizationName?: string; avatar_url?: string | null;
        };
        return {
          id: u.id ?? "unknown",
          email: u.email ?? "",
          full_name: u.name,
          farm_name: u.organizationName,
          avatar_url: u.avatar_url ?? null,
        };
      }
    } catch { /* ignore */ }
    return { id: "unknown", email: "" };
  }
}

/**
 * Update the current user's profile fields.
 * If `avatar` is provided it is sent as multipart/form-data; otherwise JSON.
 */
export async function updateUserProfile(input: {
  full_name?: string;
  phone?: string;
  farm_name?: string;
  location?: string;
  bio?: string;
  avatar?: File;
}): Promise<UserProfile> {
  try {
    if (input.avatar) {
      const form = new FormData();
      if (input.full_name  !== undefined) form.append("full_name",  input.full_name);
      if (input.phone      !== undefined) form.append("phone",      input.phone);
      if (input.farm_name  !== undefined) form.append("farm_name",  input.farm_name);
      if (input.location   !== undefined) form.append("location",   input.location);
      if (input.bio        !== undefined) form.append("bio",        input.bio);
      form.append("avatar", input.avatar);
      const { data } = await apiClient.patch<UserProfile>("/api/v1/users/me", form);
      return data;
    }
    const { full_name, phone, farm_name, location, bio } = input;
    const { data } = await apiClient.patch<UserProfile>("/api/v1/users/me", {
      full_name, phone, farm_name, location, bio,
    });
    return data;
  } catch (e) { norm(e); }
}

/** Change the current user's password. */
export async function changeUserPassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  try {
    await apiClient.post("/api/v1/users/me/change-password", {
      current_password: input.currentPassword,
      new_password:     input.newPassword,
    });
  } catch (e) { norm(e); }
}

// ── Account security actions (Settings → Security) ──────────────────────────

/** Change the account's sign-in email (verifies the current password first).
 *  All sessions are invalidated, so the caller should sign back in. */
export async function changeUserEmail(input: {
  newEmail: string;
  currentPassword: string;
}): Promise<void> {
  try {
    await apiClient.post("/api/v1/users/me/change-email", {
      new_email: input.newEmail,
      current_password: input.currentPassword,
    });
  } catch (e) { norm(e); }
}

/** Permanently delete this account and every row/file it owns. Irreversible. */
export async function deleteAccount(input: { password: string }): Promise<void> {
  try {
    await apiClient.post("/api/v1/users/me/delete-account", { password: input.password });
  } catch (e) { norm(e); }
}

/** End every signed-in session by stamping a token-invalidation threshold. The
 *  caller's own token dies too, so the client should clear it and sign in. */
export async function signOutEverywhere(): Promise<void> {
  try {
    await apiClient.post("/api/v1/users/me/sign-out-all");
  } catch (e) { norm(e); }
}

export interface LoginSession {
  when: string | null;
  device: string;
  method: string;
  ip: string;
}

/** Recent sign-in activity (the honest "active sessions" view for JWT auth). */
export async function fetchLoginSessions(): Promise<LoginSession[]> {
  try {
    const { data } = await apiClient.get<{ sessions: LoginSession[] }>("/api/v1/users/me/sessions");
    return data?.sessions ?? [];
  } catch (e) { norm(e); }
}

// ── Two-factor authentication (TOTP) ────────────────────────────────────────

export interface TwoFactorSetup {
  secret: string;
  otpauth_uri: string;
  enabled: boolean;
  message?: string;
}

/** Begin 2FA enrolment: get a fresh secret + otpauth:// URI (not yet enabled). */
export async function setupTwoFactor(): Promise<TwoFactorSetup> {
  try {
    const { data } = await apiClient.post<TwoFactorSetup>("/api/v1/users/me/2fa/setup");
    return data;
  } catch (e) { norm(e); }
}

/** Confirm the enrolment with a valid code, turning 2FA on. */
export async function enableTwoFactor(code: string): Promise<void> {
  try {
    await apiClient.post("/api/v1/users/me/2fa/enable", { code });
    await fetchUserSettings();
  } catch (e) { norm(e); }
}

/** Turn 2FA off (requires a current valid code). */
export async function disableTwoFactor(code: string): Promise<void> {
  try {
    await apiClient.post("/api/v1/users/me/2fa/disable", { code });
    await fetchUserSettings();
  } catch (e) { norm(e); }
}

/** Delete ALL prediction history + stored images (Settings → Privacy). */
export async function deleteAllHistory(): Promise<{ deleted: number; images_removed: number }> {
  try {
    const { data } = await apiClient.delete<{ deleted: number; images_removed: number }>(
      "/api/v1/history"
    );
    return data;
  } catch (e) { norm(e); }
}

// ── Calendar & reminders ──────────────────────────────────────────────────────
// Expected backend routes (not implemented yet in FastAPI):
//   GET    /api/v1/users/me/calendar?year=&month=
//   POST   /api/v1/users/me/reminders
//   PATCH  /api/v1/users/me/reminders/{id}
//   DELETE /api/v1/users/me/reminders/{id}
// Until those exist, scan dots are derived from /api/v1/history and reminders
// persist in localStorage (see usingFallback on CalendarMonthResponse).

export interface CalendarScanEntry {
  prediction_id: string | number;
  date: string;
  disease_name: string;
  severity: string;
  thumbnail_url?: string | null;
  /** ISO timestamp when the backend provides it (history fallback). */
  created_at?: string | null;
}

export type ReminderCategory = "scan" | "disease" | "weather" | "farm" | "general";
export type ReminderPriority = "low" | "medium" | "high";
export type ReminderStatus = "pending" | "completed";
export type ReminderRepeat = "none" | "daily" | "weekly" | "monthly" | "custom";
export type ReminderSource = "manual" | "prediction_followup" | "weather_risk";

export interface CalendarReminder {
  id: string | number;
  date: string;
  title: string;
  note?: string;
  category?: ReminderCategory;
  priority?: ReminderPriority;
  status?: ReminderStatus;
  /** HH:MM, optional time-of-day. */
  reminder_time?: string | null;
  notification_enabled?: boolean;
  /** Minutes to notify before the due time (0 = at due). */
  notification_offset?: number;
  notified_at?: string | null;
  repeat_rule?: ReminderRepeat;
  repeat_interval_days?: number | null;
  source?: ReminderSource;
  related_prediction_id?: string | null;
  related_disease?: string | null;
  related_weather_risk_disease?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

/** Full field set accepted when creating a reminder (spec §5). */
export interface ReminderCreateInput {
  date: string;
  title: string;
  note?: string;
  category?: ReminderCategory;
  priority?: ReminderPriority;
  reminder_time?: string | null;
  notification_enabled?: boolean;
  notification_offset?: number;
  repeat_rule?: ReminderRepeat;
  repeat_interval_days?: number | null;
  source?: ReminderSource;
  related_prediction_id?: string | null;
  related_disease?: string | null;
  related_weather_risk_disease?: string | null;
}

export interface CalendarMonthResponse {
  scans: CalendarScanEntry[];
  reminders: CalendarReminder[];
  /** True when the calendar API is unavailable and fallbacks were used. */
  usingFallback?: boolean;
}

const CALENDAR_REMINDERS_LS = "wg_calendar_reminders_v1";

function calendarApiUnavailable(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 405);
}

function readLocalReminders(): CalendarReminder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CALENDAR_REMINDERS_LS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CalendarReminder[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalReminders(items: CalendarReminder[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CALENDAR_REMINDERS_LS, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

function isoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function remindersForMonth(year: number, month1: number): CalendarReminder[] {
  const prefix = `${year}-${String(month1).padStart(2, "0")}-`;
  return readLocalReminders().filter((r) => String(r.date).startsWith(prefix));
}

function historyItemToCalendarScan(item: HistoryItem): CalendarScanEntry | null {
  const created = item.created_at ? new Date(item.created_at) : null;
  if (!created || Number.isNaN(created.getTime())) return null;
  return {
    prediction_id: item.id,
    date: isoDateLocal(created),
    disease_name: item.predicted_class,
    severity: item.severity,
    thumbnail_url: item.image_url,
    created_at: item.created_at,
  };
}

async function calendarScansFromHistoryAll(): Promise<CalendarScanEntry[]> {
  const scans: CalendarScanEntry[] = [];
  let page = 1;
  const limit = 100;

  while (true) {
    const res = await fetchHistory({ page, limit, sort: "newest" });
    for (const item of res.items) {
      const entry = historyItemToCalendarScan(item);
      if (entry) scans.push(entry);
    }
    if (page >= res.total_pages || res.items.length === 0) break;
    page += 1;
  }

  return scans;
}

async function calendarScansFromHistory(year: number, month1: number): Promise<CalendarScanEntry[]> {
  const prefix = `${year}-${String(month1).padStart(2, "0")}-`;
  const all = await calendarScansFromHistoryAll();
  return all.filter((s) => s.date.startsWith(prefix));
}

/** Full prediction timeline for the calendar (history fallback when API missing). */
export async function fetchAllCalendarScans(): Promise<{
  scans: CalendarScanEntry[];
  usingFallback: boolean;
}> {
  try {
    const { data } = await apiClient.get<{ scans: CalendarScanEntry[] }>(
      "/api/v1/users/me/calendar/scans"
    );
    return {
      scans: Array.isArray(data.scans) ? data.scans : [],
      usingFallback: false,
    };
  } catch (e) {
    if (!calendarApiUnavailable(e)) norm(e);
    return { scans: await calendarScansFromHistoryAll(), usingFallback: true };
  }
}

export async function fetchAllCalendarReminders(): Promise<CalendarReminder[]> {
  try {
    const { data } = await apiClient.get<{ reminders: CalendarReminder[] }>(
      "/api/v1/users/me/reminders"
    );
    return Array.isArray(data.reminders) ? data.reminders : [];
  } catch (e) {
    if (!calendarApiUnavailable(e)) norm(e);
    return readLocalReminders();
  }
}

/** @param month Calendar month 1–12 (January = 1). */
export async function fetchCalendarMonth(
  year: number,
  month: number
): Promise<CalendarMonthResponse> {
  try {
    const { data } = await apiClient.get<CalendarMonthResponse>("/api/v1/users/me/calendar", {
      params: { year, month },
    });
    return {
      scans: Array.isArray(data.scans) ? data.scans : [],
      reminders: Array.isArray(data.reminders) ? data.reminders : [],
      usingFallback: false,
    };
  } catch (e) {
    if (!calendarApiUnavailable(e)) norm(e);
    const scans = await calendarScansFromHistory(year, month);
    return {
      scans,
      reminders: remindersForMonth(year, month),
      usingFallback: true,
    };
  }
}

export async function createReminder(input: ReminderCreateInput): Promise<CalendarReminder> {
  try {
    const { data } = await apiClient.post<CalendarReminder>("/api/v1/users/me/reminders", input);
    return data;
  } catch (e) {
    if (!calendarApiUnavailable(e)) norm(e);
    const reminder: CalendarReminder = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      date: input.date,
      title: input.title.trim(),
      note: input.note?.trim() || undefined,
      category: input.category ?? "general",
      priority: input.priority ?? "medium",
      status: "pending",
      reminder_time: input.reminder_time ?? null,
      notification_enabled: input.notification_enabled ?? true,
      notification_offset: input.notification_offset ?? 0,
      repeat_rule: input.repeat_rule ?? "none",
      repeat_interval_days: input.repeat_interval_days ?? null,
      source: input.source ?? "manual",
      related_prediction_id: input.related_prediction_id ?? null,
      related_disease: input.related_disease ?? null,
      related_weather_risk_disease: input.related_weather_risk_disease ?? null,
    };
    const all = readLocalReminders();
    all.push(reminder);
    writeLocalReminders(all);
    return reminder;
  }
}

export async function updateReminder(
  id: string | number,
  input: { title?: string; note?: string }
): Promise<CalendarReminder> {
  try {
    const { data } = await apiClient.patch<CalendarReminder>(
      `/api/v1/users/me/reminders/${encodeURIComponent(String(id))}`,
      input
    );
    return data;
  } catch (e) {
    if (!calendarApiUnavailable(e)) norm(e);
    const all = readLocalReminders();
    const idx = all.findIndex((r) => String(r.id) === String(id));
    if (idx === -1) {
      throw new ApiError(404, "not_found", "Reminder not found.");
    }
    const updated: CalendarReminder = {
      ...all[idx],
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.note !== undefined ? { note: input.note.trim() || undefined } : {}),
    };
    all[idx] = updated;
    writeLocalReminders(all);
    return updated;
  }
}

export async function deleteReminder(id: string | number): Promise<void> {
  try {
    await apiClient.delete(`/api/v1/users/me/reminders/${encodeURIComponent(String(id))}`);
  } catch (e) {
    if (!calendarApiUnavailable(e)) norm(e);
    const all = readLocalReminders().filter((r) => String(r.id) !== String(id));
    writeLocalReminders(all);
  }
}

// ── Reminder actions: complete / snooze / reschedule / sweep ─────────────────

function patchLocalReminder(id: string | number, patch: Partial<CalendarReminder>): CalendarReminder {
  const all = readLocalReminders();
  const idx = all.findIndex((r) => String(r.id) === String(id));
  if (idx === -1) throw new ApiError(404, "not_found", "Reminder not found.");
  const updated: CalendarReminder = { ...all[idx], ...patch };
  all[idx] = updated;
  writeLocalReminders(all);
  return updated;
}

function addDaysLocal(dateStr: string, days: number): string {
  const d = new Date(`${String(dateStr).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  d.setDate(d.getDate() + days);
  return isoDateLocal(d);
}

export async function completeReminder(id: string | number): Promise<CalendarReminder> {
  try {
    const { data } = await apiClient.post<CalendarReminder>(
      `/api/v1/users/me/reminders/${encodeURIComponent(String(id))}/complete`
    );
    return data;
  } catch (e) {
    if (!calendarApiUnavailable(e)) norm(e);
    return patchLocalReminder(id, {
      status: "completed",
      completed_at: new Date().toISOString(),
    });
  }
}

export interface SnoozeInput {
  until?: "today" | "tomorrow" | "in3d" | "in7d" | "custom";
  custom_datetime?: string;
  minutes?: number;
}

export async function snoozeReminder(
  id: string | number,
  input: SnoozeInput
): Promise<CalendarReminder> {
  try {
    const { data } = await apiClient.post<CalendarReminder>(
      `/api/v1/users/me/reminders/${encodeURIComponent(String(id))}/snooze`,
      input
    );
    return data;
  } catch (e) {
    if (!calendarApiUnavailable(e)) norm(e);
    const all = readLocalReminders();
    const cur = all.find((r) => String(r.id) === String(id));
    if (!cur) throw new ApiError(404, "not_found", "Reminder not found.");
    let newDate = cur.date;
    let newTime = cur.reminder_time ?? null;
    const today = isoDateLocal(new Date());
    if (input.minutes != null) {
      const base = new Date(`${cur.date}T${newTime || "09:00"}:00`);
      base.setMinutes(base.getMinutes() + input.minutes);
      newDate = isoDateLocal(base);
      newTime = `${String(base.getHours()).padStart(2, "0")}:${String(
        base.getMinutes()
      ).padStart(2, "0")}`;
    } else if (input.until === "custom" && input.custom_datetime) {
      const dt = new Date(input.custom_datetime);
      if (!Number.isNaN(dt.getTime())) {
        newDate = isoDateLocal(dt);
        newTime = `${String(dt.getHours()).padStart(2, "0")}:${String(
          dt.getMinutes()
        ).padStart(2, "0")}`;
      }
    } else if (input.until) {
      const offsets: Record<string, number> = { today: 0, tomorrow: 1, in3d: 3, in7d: 7 };
      const offset = offsets[input.until] ?? 0;
      newDate = addDaysLocal(today, offset);
    }
    return patchLocalReminder(id, {
      date: newDate,
      reminder_time: newTime,
      status: "pending",
      notified_at: null,
      completed_at: null,
    });
  }
}

export async function rescheduleReminder(
  id: string | number,
  input: { date: string; reminder_time?: string | null }
): Promise<CalendarReminder> {
  try {
    const { data } = await apiClient.post<CalendarReminder>(
      `/api/v1/users/me/reminders/${encodeURIComponent(String(id))}/reschedule`,
      input
    );
    return data;
  } catch (e) {
    if (!calendarApiUnavailable(e)) norm(e);
    return patchLocalReminder(id, {
      date: input.date,
      reminder_time: input.reminder_time ?? null,
      status: "pending",
      notified_at: null,
      completed_at: null,
    });
  }
}

/** On-open delivery of any of this user's due reminders. Idempotent server-side. */
export async function sweepReminders(): Promise<number> {
  try {
    const { data } = await apiClient.post<{ delivered: number }>(
      "/api/v1/users/me/reminders/sweep"
    );
    return typeof data?.delivered === "number" ? data.delivered : 0;
  } catch {
    // Sweep is purely best-effort — never surface an error to the calendar UI.
    return 0;
  }
}

// ── Reminder suggestions (prediction & weather follow-ups, spec §24–26) ───────

function inDaysLocal(days: number): string {
  return addDaysLocal(isoDateLocal(new Date()), days);
}

/**
 * Build the prefill for a prediction follow-up reminder. The UI shows this in
 * the Add-Reminder modal for the user to CONFIRM — nothing is created here.
 */
export function buildPredictionFollowupPrefill(pred: {
  id: string | number;
  disease: string;
}): ReminderCreateInput {
  const isHealthy = /healthy/i.test(pred.disease);
  return {
    date: inDaysLocal(isHealthy ? 7 : 3),
    title: isHealthy
      ? "Re-scan wheat leaves"
      : `Follow up: ${pred.disease} treatment`,
    note: isHealthy
      ? "Routine check: take a fresh photo to confirm the crop is still healthy."
      : `Check the treated plants and re-scan to see whether ${pred.disease} has improved.`,
    category: "disease",
    priority: isHealthy ? "low" : "high",
    source: "prediction_followup",
    related_prediction_id: String(pred.id),
    related_disease: pred.disease,
  };
}

/**
 * Build the prefill for a weather-risk monitoring reminder. Offered when a
 * disease's weather risk is High/Very High; the farmer must confirm it. Never
 * claims the disease is present — only that conditions are favourable.
 */
export function buildWeatherRiskPrefill(disease: string): ReminderCreateInput {
  return {
    date: inDaysLocal(1),
    title: `Scout for ${disease}`,
    note: `Weather conditions are favourable for increased ${disease} risk. Inspect the crop and scan any suspicious leaves.`,
    category: "weather",
    priority: "high",
    source: "weather_risk",
    related_weather_risk_disease: disease,
  };
}

// ── Admin: User Retention ─────────────────────────────────────────────────────

export interface RetentionSummary {
  total_users: number;
  active_today: number;
  active_this_week: number;
  active_this_month: number;
  new_today: number;
  new_this_week: number;
  new_this_month: number;
  total_change_pct: number;
  active_today_change_pct: number;
  active_week_change_pct: number;
  active_month_change_pct: number;
  new_today_change_pct: number;
  new_week_change_pct: number;
  new_month_change_pct: number;
}

export interface RetentionRate {
  label: string;     // "D1" | "D7" | "D14" | "D30"
  rate: number;      // 0–100
  cohort_size: number;
}

export interface RetentionTrend {
  rates: RetentionRate[];
}

export interface RetentionActivityUser {
  id: string;
  name: string;
  email: string;
  registered: string;
  last_active: string | null;
  predictions: number;
  logins: number;
  notifications: number;
  status: string;
  avatar_url?: string | null;
}

export interface RetentionActivityUsersResponse {
  users: RetentionActivityUser[];
  total: number;
}

export interface RetentionWheatSummary {
  period_days: number;
  total_predictions: number;
  severity: { low_healthy: number; medium: number; high_critical: number };
  reminders: number;
  latest: {
    id: string;
    disease: string;
    confidence_pct: number;
    image_url: string | null;
    created_at: string;
    created_at_iso: string | null;
  } | null;
}

export interface RetentionActivityBreakdown {
  period_days: number;
  predictions: number;
  calendar_views: number;
  history_views: number;
  logins: number;
  notifications: number;
  assistant_uses: number;
  other_events: number;
}

export async function fetchRetentionSummary(days = 30): Promise<RetentionSummary> {
  try {
    const { data } = await apiClient.get<RetentionSummary>(
      "/api/v1/admin/retention/summary", { params: { days } }
    );
    return data;
  } catch (e) { norm(e); }
}

export async function fetchRetentionTrend(): Promise<RetentionTrend> {
  try {
    const { data } = await apiClient.get<RetentionTrend>("/api/v1/admin/retention/trend");
    return data;
  } catch (e) { norm(e); }
}

export async function fetchRetentionUsers(
  days = 30, page = 1, limit = 20
): Promise<RetentionActivityUsersResponse> {
  try {
    const { data } = await apiClient.get<RetentionActivityUsersResponse>(
      "/api/v1/admin/retention/users", { params: { days, page, limit } }
    );
    return data;
  } catch (e) { norm(e); }
}

export async function fetchRetentionWheat(days = 30): Promise<RetentionWheatSummary> {
  try {
    const { data } = await apiClient.get<RetentionWheatSummary>(
      "/api/v1/admin/retention/wheat", { params: { days } }
    );
    return data;
  } catch (e) { norm(e); }
}

export async function fetchRetentionActivity(days = 30): Promise<RetentionActivityBreakdown> {
  try {
    const { data } = await apiClient.get<RetentionActivityBreakdown>(
      "/api/v1/admin/retention/activity", { params: { days } }
    );
    return data;
  } catch (e) { norm(e); }
}

// ── Admin: User Retention — individual users / detail / new users ────────────

export interface RetentionIndividualUser {
  id: string;
  name: string;
  email: string;
  avatar_url?: string | null;
  registered: string;
  registered_iso: string;
  last_login: string | null;
  last_logout: string | null;
  last_active: string | null;
  last_active_iso: string | null;
  total_sessions: number;
  logins: number;
  sign_outs: number;
  predictions: number;      // scoped to the selected period
  calendar_views: number;   // scoped to the selected period
  notifications: number;    // scoped to the selected period
  retained_d1: boolean;
  retained_d7: boolean;
  retained_d14: boolean;
  retained_d30: boolean;
  d1_observable: boolean;
  d7_observable: boolean;
  d14_observable: boolean;
  d30_observable: boolean;
  status: string;           // new | active | returning | inactive
}

export interface RetentionIndividualUsersResponse {
  users: RetentionIndividualUser[];
  total: number;
  page: number;
  page_size: number;
}

export type RetentionIndividualSort =
  | "newest"
  | "oldest"
  | "last_active"
  | "most_active"
  | "most_predictions"
  | "most_logins"
  | "highest_retention"
  | "lowest_retention";

export interface FetchRetentionIndividualUsersParams {
  days?: number;
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;          // all | new | active | returning | at_risk | inactive
  hasPredictions?: boolean;
  hasNotifications?: boolean;
  sort?: RetentionIndividualSort;
}

export async function fetchRetentionIndividualUsers(
  params: FetchRetentionIndividualUsersParams = {}
): Promise<RetentionIndividualUsersResponse> {
  const {
    days = 30, page = 1, pageSize = 10, search = "", status = "all",
    hasPredictions, hasNotifications, sort = "last_active",
  } = params;
  try {
    const { data } = await apiClient.get<RetentionIndividualUsersResponse>(
      "/api/v1/admin/retention/individual-users",
      {
        params: {
          days,
          page,
          page_size: pageSize,
          search: search || undefined,
          status,
          has_predictions: hasPredictions,
          has_notifications: hasNotifications,
          sort,
        },
      }
    );
    return data;
  } catch (e) { norm(e); }
}

export interface RetentionUserPrediction {
  id: string;
  disease: string;
  confidence_pct: number;
  severity: string;
  image_url: string | null;
  created_at: string;
  created_date: string;
  created_time: string;
}

export interface RetentionTimelineEvent {
  event_type: string;
  label: string;
  timestamp: string;
  display_time: string;
  prediction_id?: string | null;
  disease?: string | null;
  severity?: string | null;
  confidence_pct?: number | null;
  image_url?: string | null;
}

export interface RetentionUserDetail {
  id: string;
  name: string;
  email: string;
  organization: string;
  email_verified: boolean;
  registered: string;
  registered_iso: string;
  status: string;
  avatar_url: string | null;
  total_predictions: number;
  predictions_this_week: number;
  predictions_this_month: number;
  first_prediction_at: string | null;
  last_prediction_at: string | null;
  days_since_last_active: number | null;
  first_login_at: string | null;
  last_login_at: string | null;
  last_logout_at: string | null;
  last_active: string | null;
  last_active_iso: string | null;
  logins: number;
  sign_outs: number;
  sessions: number;
  calendar_views: number;
  history_views: number;
  prediction_views: number;
  notifications: number;
  days_active: number;
  retained_d1: boolean;
  retained_d7: boolean;
  retained_d14: boolean;
  retained_d30: boolean;
  d1_observable: boolean;
  d7_observable: boolean;
  d14_observable: boolean;
  d30_observable: boolean;
  predictions: RetentionUserPrediction[];
  timeline: RetentionTimelineEvent[];
}

export async function fetchRetentionUserDetail(userId: string): Promise<RetentionUserDetail> {
  try {
    const { data } = await apiClient.get<RetentionUserDetail>(
      `/api/v1/admin/retention/users/${encodeURIComponent(userId)}`
    );
    return data;
  } catch (e) { norm(e); }
}

export interface NewUserFunnelStage {
  key: string;
  label: string;
  count: number;
  pct_of_previous: number;
  pct_of_registered: number;
}

export interface RetentionNewUsers {
  period_days: number;
  new_today: number;
  new_this_week: number;
  new_this_month: number;
  new_in_period: number;
  logged_in_again: number;
  made_prediction: number;
  opened_calendar: number;
  returned: number;
  funnel: NewUserFunnelStage[];
}

export async function fetchRetentionNewUsers(days = 30): Promise<RetentionNewUsers> {
  try {
    const { data } = await apiClient.get<RetentionNewUsers>(
      "/api/v1/admin/retention/new-users", { params: { days } }
    );
    return data;
  } catch (e) { norm(e); }
}

// ── User activity events (client-side tracking) ──────────────────────────────

export type ActivityEventType =
  | "calendar_opened"
  | "prediction_history_opened"
  | "prediction_viewed"
  | "prediction_completed_viewed"
  | "notification_viewed"
  | "notification_clicked"
  | "profile_viewed"
  | "settings_viewed"
  | "assistant_used";

/**
 * Record a meaningful user-activity event (best-effort fire-and-forget).
 * The backend attributes the event to the authenticated JWT user; the
 * promise never rejects so callers don't need their own try/catch.
 */
export async function recordActivityEvent(
  eventType: ActivityEventType,
  options: { predictionId?: string; metadata?: Record<string, unknown> } = {}
): Promise<void> {
  try {
    await apiClient.post("/api/v1/activity/events", {
      event_type: eventType,
      prediction_id: options.predictionId,
      metadata: options.metadata,
    });
  } catch {
    // Best-effort: activity tracking must never break a user flow.
  }
}

// ── Built-in AI Assistant ───────────────────────────────────────────────────
// The former multi-bot Chatbot subsystem (per-user providers, API keys,
// creation wizard, conversations/messages) has been retired. Chat now flows
// through the single server-side OpenRouter assistant above (sendChat /
// fetchSuggestedQuestions). No chatbot-scoped client functions remain here.
