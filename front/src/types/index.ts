// WheatGuard AI – Shared TypeScript types
// Mirror the FastAPI Pydantic response schemas exactly.

export interface TopPrediction {
  rank: number;
  class_name: string;
  confidence: number;
  confidence_percentage: number;
}

export interface DiseaseInfo {
  display_name: string;
  description: string;
  symptoms: string[];
  prevention: string[];
  management: string[];
  severity: SeverityLevel | string;
  risk_level: string;
  disclaimer: string;
}

export interface GradCAMResult {
  original: string; // base64 PNG data URI
  heatmap: string;
  overlay: string;
}

export interface PredictionResponse {
  prediction_id: string;
  prediction: string;
  confidence: number;
  confidence_percentage: number;
  confidence_level: ConfidenceLevel | string;
  low_confidence: boolean;
  severity: SeverityLevel | string;
  top_predictions: TopPrediction[];
  disease_info: DiseaseInfo;
  recommendation: string;
  gradcam: GradCAMResult | null;
  gradcam_available: boolean;
  inference_time_ms: number;
  model_version: string;
  image_url: string | null;
  ai_report?: any;
  /** True when the alert email was handed to the mail service */
  email_queued?: boolean;
  /** True only when the mail provider confirmed it accepted the alert */
  email_sent?: boolean;
}

export interface HistoryItem {
  id: string;
  // Server may return a dedicated prediction id distinct from the row id;
  // the history detail route keys off this when present.
  prediction_id?: string;
  filename: string;
  predicted_class: string;
  confidence: number;
  confidence_pct: number;
  low_confidence: boolean;
  severity: SeverityLevel;
  top_predictions: TopPrediction[];
  recommendation: string | null;
  inference_time_ms: number | null;
  model_version: string | null;
  image_hash: string | null;
  image_url: string | null;
  gradcam_available: boolean;
  created_at: string;
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

export interface HealthResponse {
  status: "healthy" | "degraded";
  api: string;
  model: string;
  database: string;
  model_loaded: boolean;
  model_version: string;
  num_classes: number;
  device: string;
  app_version: string;
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

export interface ModelInfoResponse {
  model_name: string;
  model_version: string;
  architecture: string;
  supported_classes: number;
  classes: string[];
  input_size: string;
  device: string;
  gradcam_supported: boolean;
  loaded: boolean;
}

export interface TimeSeriesPoint {
  date: string;
  count: number;
}

export interface TrendsResponse {
  range: string;
  total_predictions: number;
  healthy_predictions: number;
  diseased_predictions: number;
  critical_cases: number;
  high_cases: number;
  moderate_cases: number;
  average_confidence: number;
  max_confidence: number;
  min_confidence: number;
  most_common_disease: string | null;
  disease_distribution: Record<string, number>;
  severity_distribution: Record<string, number>;
  daily_predictions: TimeSeriesPoint[];
  confidence_trend: ConfidenceTrendPoint[];
}

export interface ConfidenceTrendPoint {
  date: string;
  avg_confidence: number;
  count: number;
}

export type SeverityLevel = "none" | "moderate" | "high" | "critical" | "unknown";
export type ConfidenceLevel = "High" | "Moderate" | "Low" | "Very Low" | "Unknown";

export interface ApiError {
  error: string;
  detail: string;
}

// ── Notifications ──────────────────────────────────────────────────────────────

export type NotificationType = "prediction" | "weather" | "report" | "system" | "login" | "security" | "account" | "admin";

export interface NotificationItem {
  id: string;
  user_id?: string;
  type: NotificationType | string;
  title: string;
  /** Backend returns `message`; mapped to body in the bell component */
  message?: string;
  body?: string;
  severity?: SeverityLevel | string;
  /** Backend column is `is_read` */
  is_read?: boolean;
  read?: boolean;
  link?: string | null;
  action_url?: string | null;
  category?: string;
  priority?: string;
  created_at: string;
}

export interface NotificationsResponse {
  /** Backend returns `notifications`; frontend also accepts `items` */
  notifications?: NotificationItem[];
  items?: NotificationItem[];
  total: number;
  unread?: number;
  page?: number;
  limit?: number;
}

export interface UnreadCountResponse {
  /** Backend returns `count`; frontend also accepts `unread` */
  count?: number;
  unread?: number;
}

/**
 * Maps to the `notification_preferences` table in the auth backend.
 * All 4 user-visible toggles are mapped to real backend columns.
 *
 * high_risk      → email_security  (security alerts emailed)
 * daily_digest   → account_alerts  (account activity in-app)
 * weekly_email   → email_system    (system/weekly emails)
 * weather_warnings → system_alerts (system-level in-app alerts)
 *
 * The full set of backend columns is also exposed for completeness.
 */
export interface NotificationPreferences {
  // User-facing toggles (mapped to backend columns below)
  high_risk: boolean;
  daily_digest: boolean;
  weekly_email: boolean;
  weather_warnings: boolean;

  // Full backend columns (optional — used when reading from API)
  login_alerts?: boolean;
  security_alerts?: boolean;
  password_alerts?: boolean;
  account_alerts?: boolean;
  system_alerts?: boolean;
  admin_alerts?: boolean;
  email_enabled?: boolean;
  email_login?: boolean;
  email_security?: boolean;
  email_password?: boolean;
  email_account?: boolean;
  email_system?: boolean;
  email_admin?: boolean;
  email_support?: boolean;
}

/** Map from user-facing toggle keys to real backend column names */
export const PREF_COLUMN_MAP = {
  high_risk:        { inApp: "security_alerts", email: "email_security" },
  daily_digest:     { inApp: "account_alerts",  email: "email_account"  },
  weekly_email:     { inApp: "system_alerts",   email: "email_system"   },
  weather_warnings: { inApp: "admin_alerts",    email: "email_admin"    },
} as const;

// ── Query / Support System ──────────────────────────────────────────────────
// Mirrors the `support_queries` / `support_messages` tables exposed by the
// Node auth service under /api/support and /api/admin/support.

export type SupportStatus =
  | "new" | "open" | "waiting_user" | "waiting_admin" | "resolved" | "closed";

export type SupportPriority = "low" | "medium" | "high" | "critical";

export interface SupportQuery {
  id: string;
  ticket: string;
  user_id: string;
  subject: string;
  category: string | null;
  status: SupportStatus;
  priority: SupportPriority;
  assigned_admin_id: string | null;
  conversation_id: string | null;
  user_name: string | null;
  user_email: string | null;
  auth_provider: string | null;
  last_message_at: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  // Enriched in list responses:
  message_count?: number;
  unread_for_user?: number;
}

export interface SupportMessage {
  id: string;
  query_id: string;
  sender_id: string;
  sender_type: "user" | "admin";
  message: string;
  is_internal: boolean;
  user_read: boolean;
  admin_read: boolean;
  created_at: string;
}

export interface AdminSupportStats {
  total: number;
  new: number;
  open: number;
  waiting_user: number;
  waiting_admin: number;
  resolved: number;
  closed: number;
}

export interface AssignableAdmin {
  id: string;
  name: string | null;
  email: string | null;
}

export interface AdminQueryListParams {
  search?: string;
  status?: SupportStatus | "";
  priority?: SupportPriority | "";
  category?: string | "";
  assigned_admin?: string | "";
  from?: string;
  to?: string;
  sort?: string;
  page?: number;
  limit?: number;
}

/** Categories offered in the new-query form (spec §7). */
export const SUPPORT_CATEGORIES = [
  "General",
  "Account & Login",
  "Prediction / Diagnosis",
  "Technical Issue",
  "Billing",
  "Feature Request",
  "Report Abuse",
  "Other",
] as const;

// ── Feedback Management System ──────────────────────────────────────────────
// Mirrors the `feedback` / `feedback_messages` / `feedback_notes` /
// `feedback_settings` tables exposed by the Node auth service under
// /api/feedback and /api/admin/feedback.

export type FeedbackStatus =
  | "new" | "under_review" | "in_progress" | "resolved" | "closed";

export type FeedbackPriority = "low" | "medium" | "high" | "critical";

export interface FeedbackItem {
  id: string;
  ticket: string;
  user_id: string;
  type: string;
  category: string | null;
  rating: number | null;
  message: string;
  status: FeedbackStatus;
  priority: FeedbackPriority;
  assigned_admin_id: string | null;
  conversation_id: string | null;
  message_id: string | null;
  provider: string | null;
  model: string | null;
  user_name: string | null;
  user_email: string | null;
  auth_provider: string | null;
  updated_by: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
  // Enriched in list responses:
  reply_count?: number;
  unread_replies?: number;
}

export interface FeedbackMessage {
  id: string;
  feedback_id: string;
  sender_id: string;
  sender_type: "user" | "admin";
  message: string;
  user_read: boolean;
  created_at: string;
}

export interface FeedbackNote {
  id: string;
  feedback_id: string;
  admin_id: string;
  admin_name?: string;
  note: string;
  created_at: string;
}

export interface AdminFeedbackStats {
  total: number;
  new: number;
  under_review: number;
  in_progress: number;
  resolved: number;
  closed: number;
  avg_rating: number;
  rated_count: number;
}

export interface AdminFeedbackListParams {
  search?: string;
  type?: string | "";
  status?: FeedbackStatus | "";
  priority?: FeedbackPriority | "";
  rating?: number | "";
  assigned_admin?: string | "";
  from?: string;
  to?: string;
  sort?: string;
  page?: number;
  limit?: number;
}

export interface FeedbackSettings {
  first_prompt_login: number;
  prompt_interval: number;
  cooldown_days: number;
  require_rating: boolean;
  enabled: boolean;
}

export interface FeedbackNameCount {
  name: string;
  count: number;
}

export interface FeedbackAnalytics {
  total: number;
  rating_distribution: Record<number, number>;
  by_type: FeedbackNameCount[];
  by_provider: FeedbackNameCount[];
  by_model: FeedbackNameCount[];
  trend: { date: string; count: number }[];
}

/** Feedback types offered in the submit form (spec §5). */
export const FEEDBACK_TYPES = [
  "General Feedback",
  "Bug Report",
  "Feature Request",
  "UI/UX",
  "Performance",
  "Chatbot Experience",
  "Other",
] as const;

