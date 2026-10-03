"use client";

import dynamic from "next/dynamic";
import { PageSkeleton } from "@/components/wg/admin/ui";

// Lazy-load the heavy page so the admin shell paints and hydrates immediately.
const DiagnosisPage = dynamic(
  () => import("@/components/wg/admin/DiagnosisPage").then((m) => m.DiagnosisPage),
  { ssr: false, loading: PageSkeleton }
);

export default function AdminDiagnosisPage() {
  return <DiagnosisPage />;
}
