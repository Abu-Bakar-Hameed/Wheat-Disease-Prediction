/**
 * WheatGuard AI – Activity Service
 *
 * Central service for recording user-activity events into the
 * `user_activity` table used by the admin retention analytics module.
 * Uses supabaseAdmin so RLS never blocks server-side writes.
 *
 * Design rules:
 *   • Every write is BEST-EFFORT — activity tracking must never break
 *     or slow down authentication. All failures are logged and swallowed.
 *   • user_id always comes from a verified JWT payload or a freshly
 *     created Supabase auth user — NEVER from the request body.
 *
 * Event types written here:
 *   user_registered — profile created (email registration or first OAuth login)
 *   user_login      — successful login (password, admin, or OAuth)
 *   user_logout     — explicit application logout
 */

import { supabaseAdmin } from "../config/supabase.js";

const TABLE = "user_activity";

// Schema-drift warning is logged once per process — older databases may
// predate the metadata column (see supabase/schema_activity.sql).
let warnedReducedColumns = false;

/**
 * Insert one activity row (fire-and-forget; resolves to true/false).
 *
 * @param {object} params
 * @param {string} params.userId    - Supabase Auth user UUID
 * @param {string} params.eventType - user_registered | user_login | user_logout
 * @param {object} [params.metadata]
 * @returns {Promise<boolean>}
 */
export async function recordActivity({ userId, eventType, metadata = {} }) {
  if (!userId || !eventType) return false;

  try {
    const { error } = await supabaseAdmin.from(TABLE).insert({
      user_id: String(userId),
      event_type: String(eventType),
      metadata,
    });

    if (error) throw error;
    return true;
  } catch (error) {
    // Older deployments of user_activity may lack the metadata column —
    // retry with the base payload so the event is not lost.
    const missingColumn =
      error?.code === "42703" || /does not exist/i.test(error?.message ?? "");
    if (missingColumn) {
      try {
        const { error: retryError } = await supabaseAdmin.from(TABLE).insert({
          user_id: String(userId),
          event_type: String(eventType),
        });
        if (!retryError) {
          if (!warnedReducedColumns) {
            warnedReducedColumns = true;
            console.warn(
              "⚠️ user_activity is missing the metadata column — recording base events. Run supabase/schema_activity.sql."
            );
          }
          return true;
        }
        throw retryError;
      } catch (retryError) {
        console.error(
          `❌ Activity record failed (${eventType} / ${userId}):`,
          retryError.message
        );
        return false;
      }
    }
    // Best-effort by design: never propagate tracking failures.
    console.error(
      `❌ Activity record failed (${eventType} / ${userId}):`,
      error.message
    );
    return false;
  }
}
