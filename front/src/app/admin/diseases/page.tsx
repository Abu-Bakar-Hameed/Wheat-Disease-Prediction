"use client";

import dynamic from "next/dynamic";
import { PageSkeleton } from "@/components/wg/admin/ui";

// Lazy-load the heavy page so the admin shell paints and hydrates immediately.
const DiseasesPage = dynamic(
  () => import("@/components/wg/admin/DiseasesPage").then((m) => m.DiseasesPage),
  { ssr: false, loading: PageSkeleton }
);

export default function AdminDiseasesPage() {
  return <DiseasesPage />;
}
