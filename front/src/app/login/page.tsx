"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AuthModal, type AuthMode } from "@/components/wg/AuthModal";
import { AuthLayout } from "@/components/wg/auth/AuthLayout";

// Modes a visitor can land on directly. Admin sign in opens inline on this
// same page (mode=admin-login), not on a separate route.
const VALID_MODES: AuthMode[] = [
  "user-login",
  "admin-login",
  "register",
  "forgot-password",
];

function AuthPanel() {
  const params = useSearchParams();
  const raw = params.get("mode") as AuthMode | null;
  const initialMode: AuthMode =
    raw && VALID_MODES.includes(raw) ? raw : "user-login";

  return (
    <AuthModal isOpen={true} inline={true} onClose={() => {}} initialMode={initialMode} />
  );
}

export default function LoginPage() {
  return (
    <AuthLayout>
      <Suspense fallback={null}>
        <AuthPanel />
      </Suspense>
    </AuthLayout>
  );
}
