"use client";

import dynamic from "next/dynamic";
import { PageSkeleton } from "@/components/wg/admin/ui";

// Lazy-load the heavy page so the admin shell paints and hydrates immediately.
const FeedbackPage = dynamic(
  () => import("@/components/wg/admin/FeedbackPage").then((m) => m.FeedbackPage),
  { ssr: false, loading: PageSkeleton }
);

export default function AdminFeedbackPage() {
  return <FeedbackPage />;
}
