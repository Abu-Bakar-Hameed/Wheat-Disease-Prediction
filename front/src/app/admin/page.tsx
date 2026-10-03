"use client";

import dynamic from "next/dynamic";
import { PageSkeleton } from "@/components/wg/admin/ui";

// Lazy-load the heavy dashboard (recharts) so the admin shell paints and
// hydrates immediately instead of blocking on chart code.
const DashboardPage = dynamic(
  () => import("@/components/wg/admin/DashboardPage").then((m) => m.DashboardPage),
  { ssr: false, loading: PageSkeleton }
);

export default function AdminDashboardPage() {
  return <DashboardPage />;
}
