"use client";

import { useApp } from "@/lib/appState";
import { DashboardPage } from "@/components/wg/admin/DashboardPage";
import { CropsPage } from "@/components/wg/admin/CropsPage";
import { UsersPage } from "@/components/wg/admin/UsersPage";
import { DiagnosisPage } from "@/components/wg/admin/DiagnosisPage";
import { DiseasesPage } from "@/components/wg/admin/DiseasesPage";
import { LogsPage } from "@/components/wg/admin/LogsPage";
import { SettingsPage } from "@/components/wg/admin/SettingsPage";

export function AdminView() {
  const { adminTab } = useApp();
  return (
    <div className="max-w-7xl mx-auto p-6">
      {adminTab === "dashboard" && <DashboardPage />}
      {adminTab === "crops" && <CropsPage />}
      {adminTab === "users" && <UsersPage />}
      {adminTab === "diagnosis" && <DiagnosisPage />}
      {adminTab === "diseases" && <DiseasesPage />}
      {adminTab === "logs" && <LogsPage />}
      {adminTab === "settings" && <SettingsPage />}
    </div>
  );
}
