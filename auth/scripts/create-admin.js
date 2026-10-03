// One-off setup script: creates (or promotes) an admin account.
//
// Usage:
//   node scripts/create-admin.js
//   node scripts/create-admin.js --email you@example.com --password "Something123" --name "Jane Admin" --org "Acme"
//
// What it does:
//   1. If a Supabase Auth user with this email doesn't exist, creates one
//      (email pre-confirmed, so no OTP step needed for this account).
//   2. If a `profiles` row doesn't exist for that user, creates one with
//      role = "admin" and email_verified = true.
//   3. If the profile already exists, promotes it to role = "admin" and
//      marks email_verified = true.
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env (already
// present in this project). Run this from the project root.

import "dotenv/config";
import { supabaseAdmin } from "../src/config/supabase.js";

const args = process.argv.slice(2);

const getArg = (flag, fallback) => {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
};

const email    = getArg("--email", "sw@gmail.com").trim().toLowerCase();
const password = getArg("--password", "sw@gmail.com");
const name     = getArg("--name", "Admin");
const org      = getArg("--org", "Admin Organization");

async function main() {
  console.log(`Setting up admin account for ${email} ...`);

  // --------------------------------------------------------
  // 1. Find or create the Supabase Auth user
  // --------------------------------------------------------

  let userId;

  // listUsers doesn't support filtering by email server-side in every
  // supabase-js version, so we page through and match manually for a
  // small user base. For larger projects, query `profiles` by email
  // instead (see step 2) and only fall back to creating a new user.
  const { data: existingProfile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existingProfile) {
    userId = existingProfile.id;
    console.log(`Found existing profile (id: ${userId}).`);
  } else {
    const { data: created, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          name,
          organization_name: org
        }
      });

    if (createError) {
      console.error("Failed to create auth user:", createError.message);
      process.exit(1);
    }

    userId = created.user.id;
    console.log(`Created new auth user (id: ${userId}).`);
  }

  // --------------------------------------------------------
  // 2. Upsert the profile as an admin
  // --------------------------------------------------------

  const { error: upsertError } = await supabaseAdmin
    .from("profiles")
    .upsert(
      {
        id: userId,
        name,
        organization_name: org,
        email,
        role: "admin",
        email_verified: true
      },
      { onConflict: "id" }
    );

  if (upsertError) {
    console.error("Failed to upsert admin profile:", upsertError.message);
    process.exit(1);
  }

  // Also make sure the auth password matches, in case the user already
  // existed with a different password.
  const { error: updatePwError } =
    await supabaseAdmin.auth.admin.updateUserById(userId, { password });

  if (updatePwError) {
    console.error("Failed to set password:", updatePwError.message);
    process.exit(1);
  }

  console.log("✅ Admin account is ready.");
  console.log(`   Email:    ${email}`);
  console.log(`   Password: ${password}`);
  console.log("   Role:     admin");
  console.log("");
  console.log("Test it with:");
  console.log(`   POST /api/auth/admin/login`);
  console.log(`   Header: X-Admin-Secret-Key: <your ADMIN_SECRET_KEY>`);
  console.log(`   Body:   { "email": "${email}", "password": "${password}" }`);
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
