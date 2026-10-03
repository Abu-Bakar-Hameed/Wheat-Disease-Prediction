"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth";
import { AppStateProvider } from "@/lib/appState";
import { Modals } from "@/components/wg/Modals";
import { ToastProvider } from "@/components/wg/ui";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AppStateProvider>
        <ToastProvider>
          {children}
          <Modals />
        </ToastProvider>
      </AppStateProvider>
    </AuthProvider>
  );
}
