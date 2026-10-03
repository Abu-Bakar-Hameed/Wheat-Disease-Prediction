"use client";

import { useState, type ReactNode } from "react";
import { AdminSidebar } from "@/components/wg/AdminSidebar";
import { AdminTopBar } from "@/components/wg/admin/AdminTopBar";

export default function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex h-full min-h-screen overflow-hidden">
      <AdminSidebar open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

      <section className="flex flex-1 flex-col overflow-hidden bg-canvas">
        <AdminTopBar onMenuClick={() => setMobileNavOpen(true)} />

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl p-4 sm:p-6">
            {children}
          </div>
        </div>
      </section>
    </div>
  );
}
