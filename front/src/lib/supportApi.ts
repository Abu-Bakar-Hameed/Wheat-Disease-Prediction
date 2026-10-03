"use client";

/**
 * WheatGuard AI – Query / Support API client.
 *
 * Talks to the Node/Express auth service (the same service that owns
 * notifications, email and the `profiles` identity table), NOT FastAPI.
 *
 * The auth API base is derived from NEXT_PUBLIC_AUTH_API_URL by stripping
 * the trailing `/api/auth`, giving us `<base>/api/support` and
 * `<base>/api/admin/support`. Identity is resolved server-side from the
 * Bearer JWT — this client never sends a user id.
 */

import axios, { type AxiosInstance } from "axios";
import type {
  AdminQueryListParams,
  AdminSupportStats,
  AssignableAdmin,
  SupportMessage,
  SupportQuery,
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

export async function createSupportQuery(
  subject: string,
  message: string,
  category?: string
): Promise<SupportQuery> {
  try {
    const { data } = await http.post("/api/support/queries", { subject, message, category });
    return data.query as SupportQuery;
  } catch (err) {
    fail(err);
  }
}

export async function listMyQueries(): Promise<SupportQuery[]> {
  try {
    const { data } = await http.get("/api/support/queries");
    return (data.queries ?? []) as SupportQuery[];
  } catch (err) {
    return fail(err);
  }
}

export async function unreadSupportCount(): Promise<number> {
  try {
    const { data } = await http.get("/api/support/queries/unread-count");
    return (data.count ?? 0) as number;
  } catch {
    return 0; // badge polling should never throw
  }
}

export async function getSupportQuery(
  id: string
): Promise<{ query: SupportQuery; messages: SupportMessage[] }> {
  try {
    const { data } = await http.get(`/api/support/queries/${id}`);
    return { query: data.query as SupportQuery, messages: (data.messages ?? []) as SupportMessage[] };
  } catch (err) {
    return fail(err);
  }
}

export async function replyToQuery(id: string, message: string): Promise<SupportMessage> {
  try {
    const { data } = await http.post(`/api/support/queries/${id}/messages`, { message });
    return data.message as SupportMessage;
  } catch (err) {
    return fail(err);
  }
}

export async function reopenSupportQuery(id: string, message?: string): Promise<void> {
  try {
    await http.post(`/api/support/queries/${id}/reopen`, { message });
  } catch (err) {
    fail(err);
  }
}

/** Mark the user's own live query as resolved (server enforces ownership). */
export async function resolveSupportQuery(id: string): Promise<SupportQuery> {
  try {
    const { data } = await http.post(`/api/support/queries/${id}/resolve`);
    return data.query as SupportQuery;
  } catch (err) {
    return fail(err);
  }
}

/** Delete every message of a query but keep the query itself. */
export async function clearQueryMessages(id: string): Promise<number> {
  try {
    const { data } = await http.delete(`/api/support/queries/${id}/messages`);
    return (data.cleared ?? 0) as number;
  } catch (err) {
    return fail(err);
  }
}

/** Permanently delete a query and its whole thread. */
export async function deleteSupportQuery(id: string): Promise<void> {
  try {
    await http.delete(`/api/support/queries/${id}`);
  } catch (err) {
    fail(err);
  }
}

// ── Admin endpoints ─────────────────────────────────────────────────────────

export interface AdminQueryListResult {
  queries: SupportQuery[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function adminListQueries(params: AdminQueryListParams): Promise<AdminQueryListResult> {
  try {
    const { data } = await http.get("/api/admin/support/queries", { params });
    return {
      queries: (data.queries ?? []) as SupportQuery[],
      total: data.total ?? 0,
      page: data.page ?? 1,
      limit: data.limit ?? 20,
      totalPages: data.totalPages ?? 1,
    };
  } catch (err) {
    return fail(err);
  }
}

export async function adminQueryStats(): Promise<AdminSupportStats> {
  try {
    const { data } = await http.get("/api/admin/support/queries/stats");
    return data.stats as AdminSupportStats;
  } catch (err) {
    return fail(err);
  }
}

export async function adminNewQueryCount(): Promise<number> {
  try {
    const { data } = await http.get("/api/admin/support/queries/new-count");
    return (data.count ?? 0) as number;
  } catch {
    return 0;
  }
}

export async function adminAssignableAdmins(): Promise<AssignableAdmin[]> {
  try {
    const { data } = await http.get("/api/admin/support/queries/admins");
    return (data.admins ?? []) as AssignableAdmin[];
  } catch (err) {
    return fail(err);
  }
}

export async function adminGetQuery(
  id: string
): Promise<{ query: SupportQuery; messages: SupportMessage[] }> {
  try {
    const { data } = await http.get(`/api/admin/support/queries/${id}`);
    return { query: data.query as SupportQuery, messages: (data.messages ?? []) as SupportMessage[] };
  } catch (err) {
    return fail(err);
  }
}

export async function adminReplyToQuery(
  id: string,
  message: string,
  status?: string
): Promise<SupportMessage> {
  try {
    const { data } = await http.post(`/api/admin/support/queries/${id}/messages`, { message, status });
    return data.message as SupportMessage;
  } catch (err) {
    return fail(err);
  }
}

export async function adminAddNote(id: string, message: string): Promise<SupportMessage> {
  try {
    const { data } = await http.post(`/api/admin/support/queries/${id}/notes`, { message });
    return data.note as SupportMessage;
  } catch (err) {
    return fail(err);
  }
}

export async function adminUpdateQuery(
  id: string,
  patch: { status?: string; priority?: string; assigned_admin_id?: string | null }
): Promise<SupportQuery> {
  try {
    const { data } = await http.patch(`/api/admin/support/queries/${id}`, patch);
    return data.query as SupportQuery;
  } catch (err) {
    return fail(err);
  }
}

// ── Support email preference (Settings §30) ─────────────────────────────────
// Reuses the auth service notification-preferences endpoints so the toggle is
// functional without depending on the FastAPI notification route.

export async function fetchSupportEmailPref(): Promise<boolean> {
  try {
    const { data } = await http.get("/api/notifications/preferences");
    return data?.preferences?.email_support !== false;
  } catch {
    return true;
  }
}

export async function saveSupportEmailPref(enabled: boolean): Promise<void> {
  try {
    await http.put("/api/notifications/preferences", { email_support: enabled });
  } catch (err) {
    fail(err);
  }
}
