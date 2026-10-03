"use client";

import dynamic from "next/dynamic";
import { PageSkeleton } from "@/components/wg/admin/ui";

// Lazy-load the heavy page so the admin shell paints and hydrates immediately.
const UsersPage = dynamic(
  () => import("@/components/wg/admin/UsersPage").then((m) => m.UsersPage),
  { ssr: false, loading: PageSkeleton }
);

export default function AdminUsersPage() {
  return <UsersPage />;
}
