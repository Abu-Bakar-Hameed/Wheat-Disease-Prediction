// Centralised environment variable validation for the auth service.
// Import this early (before modules that depend on env) to get
// a clear, friendly error message when required variables are
// missing. This avoids cryptic runtime exceptions later.

import "dotenv/config";

const requiredVars = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "JWT_SECRET",
  "GMAIL_USER",
  "GMAIL_APP_PASSWORD",
  "FRONTEND_URL",
  "ADMIN_SECRET_KEY",
  "PASSWORD_RESET_REDIRECT_URL",
  // OAuth vars are optional at runtime (app can run without them),
  // but include them here so users know to set them for OAuth flows.
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_CALLBACK_URL",
  "MICROSOFT_CLIENT_ID",
  "MICROSOFT_CLIENT_SECRET",
  "MICROSOFT_CALLBACK_URL"
];

const missing = requiredVars.filter((k) => !process.env[k]);

if (missing.length > 0) {
  console.error("\n❌ Missing required environment variables for auth service:\n");
  missing.forEach((k) => console.error(` - ${k}`));

  console.error(`\nPlease create a .env file in the auth project root with these entries (example):\n`);
  console.error([
    "# Supabase",
    "SUPABASE_URL=https://your-project.supabase.co",
    "SUPABASE_ANON_KEY=anon-xxx",
    "SUPABASE_SERVICE_ROLE_KEY=service_role-xxx",
    "",
    "# JWT",
    "JWT_SECRET=some_long_random_string",
    "",
    "# Redis (optional - defaults to redis://localhost:6379)",
    "REDIS_URL=redis://localhost:6379",
    "",
    "# Gmail SMTP (OTP emails)",
    "GMAIL_USER=your@gmail.com",
    "GMAIL_APP_PASSWORD=app-specific-password",
    "",
    "# App URLs",
    "FRONTEND_URL=http://localhost:3000",
    "PASSWORD_RESET_REDIRECT_URL=http://localhost:3000/reset-password",
    "",
    "# Admin secret used for /admin/login (keep secret)",
    "ADMIN_SECRET_KEY=some_shared_admin_secret",
    "",
    "# Google OAuth (register redirect exactly as below)",
    "GOOGLE_CLIENT_ID=...",
    "GOOGLE_CLIENT_SECRET=...",
    "GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback",
    "",
    "# Microsoft OAuth",
    "MICROSOFT_CLIENT_ID=...",
    "MICROSOFT_CLIENT_SECRET=...",
    "MICROSOFT_CALLBACK_URL=http://localhost:5000/api/auth/microsoft/callback",
  ].join("\n"));

  // Fail-fast: stop startup so the developer fixes env before continuing.
  // Throwing an error here will cause the process to exit with a clear message.
  throw new Error("Missing required environment variables. See logs for details.");
}

// Export a small helper in case other modules want to read known values.
export const getEnv = (key, fallback = undefined) =>
  process.env[key] ?? fallback;

export default process.env;
