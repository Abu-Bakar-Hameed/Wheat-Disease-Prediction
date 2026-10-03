"use client";

/**
 * Admin second-factor helpers.
 *
 * The Express auth service (auth/src/routes/auth.routes.js) exposes
 *   POST /admin/login   (email + password + X-Admin-Secret-Key header)
 * but has NO dedicated admin OTP endpoint yet (e.g. POST /admin/verify-otp).
 *
 * TODO(backend): add a real admin TOTP/OTP step to /admin/login and replace
 * the delegation below with a call to that endpoint. Until then the 6-digit
 * staff code collected on the client is format-checked locally and the actual
 * authentication still goes through the existing secret-key login, so the
 * admin page works end-to-end against the current backend.
 */
export async function verifyAdminSecondFactor(
  signInAsAdmin: (
    email: string,
    password: string,
    secretKey?: string
  ) => Promise<void>,
  email: string,
  password: string,
  code: string
): Promise<void> {
  // Format-check the staff code now so the guard survives once the real
  // /admin/verify-otp endpoint replaces the delegation below.
  if (!/^\d{6}$/.test(code)) {
    throw new Error("Enter the 6-digit staff code.");
  }

  // The secret key is resolved from NEXT_PUBLIC_ADMIN_SECRET_KEY inside
  // useAuth().signInAsAdmin, so we call it without an explicit key here.
  await signInAsAdmin(email, password);
}
