"use client";

import dynamic from "next/dynamic";
import { PageSkeleton } from "@/components/wg/admin/ui";

// Lazy-load the heavy page so the admin shell paints and hydrates immediately.
const QueriesPage = dynamic(
  () => import("@/components/wg/admin/QueriesPage").then((m) => m.QueriesPage),
  { ssr: false, loading: PageSkeleton }
);

export default function AdminQueriesPage() {
  return <QueriesPage />;
}
