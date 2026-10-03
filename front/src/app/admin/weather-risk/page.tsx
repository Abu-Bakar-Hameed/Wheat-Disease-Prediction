"use client";

import dynamic from "next/dynamic";
import { PageSkeleton } from "@/components/wg/admin/ui";

// Lazy-load the heavy page so the admin shell paints and hydrates immediately.
const WeatherRiskPage = dynamic(
  () => import("@/components/wg/admin/WeatherRiskPage").then((m) => m.WeatherRiskPage),
  { ssr: false, loading: PageSkeleton }
);

export default function AdminWeatherRiskPage() {
  return <WeatherRiskPage />;
}
