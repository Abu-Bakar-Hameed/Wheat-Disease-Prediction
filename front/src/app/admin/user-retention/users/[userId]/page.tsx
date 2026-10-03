"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { UserRetentionDetailPage } from "@/components/wg/admin/UserRetentionDetailPage";

/**
 * /admin/user-retention/users/[userId] — admin-only route guard + content.
 * The admin layout.tsx already wraps this with AdminSidebar + AdminTopBar.
 * Sidebar highlighting works via the /admin/user-retention prefix match.
 */
export default function UserRetentionDetailRoute() {
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const userId = String(params?.userId ?? "");

  // Redirect non-admins as soon as auth resolves
  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      router.replace("/dashboard");
    }
  }, [loading, user, isAdmin, router]);

  if (loading || !user || !isAdmin) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <span
            className="material-symbols-outlined animate-spin text-brand-700"
            style={{ fontSize: 32 }}
          >
            progress_activity
          </span>
          <p className="text-sm">Loading…</p>
        </div>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-slate-500">User not found.</p>
      </div>
    );
  }

  return <UserRetentionDetailPage userId={userId} />;
}
