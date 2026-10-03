"use client";

/**
 * WheatGuard AI – Feedback API client.
 *
 * Talks to the Node/Express auth service (which owns identity, notifications
 * and the `feedback*` tables), NOT FastAPI. Base is derived from
 * NEXT_PUBLIC_AUTH_API_URL by stripping the trailing `/api/auth`, giving
 * `<base>/api/feedback` and `<base>/api/admin/feedback`. Identity is resolved
 * server-side from the Bearer JWT — this client never sends a user id.
 */

import axios, { type AxiosInstance } from "axios";
import type {
  AdminFeedbackListParams,
  AdminFeedbackStats,
  AssignableAdmin,
  FeedbackAnalytics,
  FeedbackItem,
  FeedbackMessage,
  FeedbackNote,
  FeedbackSettings,
} from "@/types";

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

// e.g. "http://localhost:5000/api/auth" -> "http://localhost:5000"
const AUTH_URL = (process.env.NEXT_PUBLIC_AUTH_API_URL ?? "").trim().replace(/\/$/, "");
const BASE = AUTH_URL.replace(/\/api\/auth\/?$/, "");

const http: AxiosInstance = axios.create({
  baseURL: BASE,
  timeout: 30_000,
});

http.interceptors.request.use((config) => {
  const token = getStoredAccessToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (r) => r,
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

/** Normalise an axios error into a thrown Error carrying the server message. */
function fail(err: unknown): never {
  if (axios.isAxiosError(err)) {
    const msg =
      (err.response?.data as { message?: string } | undefined)?.message ||
      err.message ||
      "Request failed.";
    throw new Error(msg);
  }
  throw err instanceof Error ? err : new Error("Unexpected error.");
}

// ── User endpoints ────────────────────────────────────────────────────────────

export interface FeedbackMeta {
  types: readonly string[];
  require_rating: boolean;
}

export async function fetchFeedbackMeta(): Promise<FeedbackMeta> {
  try {
    const { data } = await http.get("/api/feedback/meta");
    return {
      types: (data.types ?? []) as string[],
      require_rating: !!data.require_rating,
    };
  } catch {
    // Fall back to a sensible default so the form still renders offline.
    return { types: [], require_rating: false };
  }
}

export interface CreateFeedbackPayload {
  type: string;
  rating: number | null;
  message: string;
  category?: string;
  // Chatbot context (optional):
  conversation_id?: string;
  message_id?: string;
  provider?: string;
  model?: string;
}

export async function submitFeedback(payload: CreateFeedbackPayload): Promise<FeedbackItem> {
  try {
    const { data } = await http.post("/api/feedback", payload);
    return data.feedback as FeedbackItem;
  } catch (err) {
    return fail(err);
  }
}

// ── Admin endpoints ───────────────────────────────────────────────────────────

export interface AdminFeedbackListResult {
  feedback: FeedbackItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function adminListFeedback(
  params: AdminFeedbackListParams
): Promise<AdminFeedbackListResult> {
  try {
    const { data } = await http.get("/api/admin/feedback", { params });
    return {
      feedback: (data.feedback ?? []) as FeedbackItem[],
      total: data.total ?? 0,
      page: data.page ?? 1,
      limit: data.limit ?? 20,
      totalPages: data.totalPages ?? 1,
    };
  } catch (err) {
    return fail(err);
  }
}

export async function adminFeedbackStats(): Promise<AdminFeedbackStats> {
  try {
    const { data } = await http.get("/api/admin/feedback/stats");
    return data.stats as AdminFeedbackStats;
  } catch (err) {
    return fail(err);
  }
}

export async function adminNewFeedbackCount(): Promise<number> {
  try {
    const { data } = await http.get("/api/admin/feedback/new-count");
    return (data.count ?? 0) as number;
  } catch {
    return 0;
  }
}

export async function adminFeedbackAnalytics(params?: {
  days?: number;
  from?: string;
  to?: string;
}): Promise<FeedbackAnalytics> {
  try {
    const { data } = await http.get("/api/admin/feedback/analytics", { params });
    return data.analytics as FeedbackAnalytics;
  } catch (err) {
    return fail(err);
  }
}

export async function adminAssignableFeedbackAdmins(): Promise<AssignableAdmin[]> {
  try {
    const { data } = await http.get("/api/admin/feedback/admins");
    return (data.admins ?? []) as AssignableAdmin[];
  } catch (err) {
    return fail(err);
  }
}

export interface AdminFeedbackDetail {
  feedback: FeedbackItem;
  messages: FeedbackMessage[];
  notes: FeedbackNote[];
}

export async function adminGetFeedback(id: string): Promise<AdminFeedbackDetail> {
  try {
    const { data } = await http.get(`/api/admin/feedback/${id}`);
    return {
      feedback: data.feedback as FeedbackItem,
      messages: (data.messages ?? []) as FeedbackMessage[],
      notes: (data.notes ?? []) as FeedbackNote[],
    };
  } catch (err) {
    return fail(err);
  }
}

export async function adminReplyToFeedback(id: string, message: string): Promise<FeedbackMessage> {
  try {
    const { data } = await http.post(`/api/admin/feedback/${id}/messages`, { message });
    return data.message as FeedbackMessage;
  } catch (err) {
    return fail(err);
  }
}

export async function adminAddFeedbackNote(id: string, note: string): Promise<FeedbackNote> {
  try {
    const { data } = await http.post(`/api/admin/feedback/${id}/notes`, { note });
    return data.note as FeedbackNote;
  } catch (err) {
    return fail(err);
  }
}

export async function adminUpdateFeedback(
  id: string,
  patch: { status?: string; priority?: string; assigned_admin_id?: string | null }
): Promise<FeedbackItem> {
  try {
    const { data } = await http.patch(`/api/admin/feedback/${id}`, patch);
    return data.feedback as FeedbackItem;
  } catch (err) {
    return fail(err);
  }
}

export async function adminDeleteFeedback(id: string): Promise<void> {
  try {
    await http.delete(`/api/admin/feedback/${id}`);
  } catch (err) {
    fail(err);
  }
}

// ── Admin: prompt settings (spec §11/§12) ─────────────────────────────────────

export async function adminGetFeedbackSettings(): Promise<FeedbackSettings> {
  try {
    const { data } = await http.get("/api/admin/feedback/settings");
    return data.settings as FeedbackSettings;
  } catch (err) {
    return fail(err);
  }
}

export async function adminUpdateFeedbackSettings(
  patch: Partial<FeedbackSettings>
): Promise<FeedbackSettings> {
  try {
    const { data } = await http.patch("/api/admin/feedback/settings", patch);
    return data.settings as FeedbackSettings;
  } catch (err) {
    return fail(err);
  }
}
