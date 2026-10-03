"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { PageSkeleton } from "@/components/wg/admin/ui";

// Lazy-load the heavy retention page (recharts) so the admin shell paints fast.
const UserRetentionPage = dynamic(
  () => import("@/components/wg/admin/UserRetentionPage").then((m) => m.UserRetentionPage),
  { ssr: false, loading: PageSkeleton }
);

/**
 * /admin/user-retention — admin-only route guard + content.
 * The admin layout.tsx already wraps this with AdminSidebar + AdminTopBar.
 */
export default function UserRetentionRoute() {
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();

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

  return <UserRetentionPage />;
}
