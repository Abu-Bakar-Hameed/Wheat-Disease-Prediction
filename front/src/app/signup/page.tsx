"use client";

import { AuthModal } from "@/components/wg/AuthModal";
import { AuthLayout } from "@/components/wg/auth/AuthLayout";

export default function SignupPage() {
  return (
    <AuthLayout>
      <AuthModal
        isOpen={true}
        inline={true}
        onClose={() => {}}
        initialMode="register"
      />
    </AuthLayout>
  );
}
