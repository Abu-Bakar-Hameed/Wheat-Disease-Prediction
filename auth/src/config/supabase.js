import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("SUPABASE_URL is missing");
}

if (!supabaseAnonKey) {
  throw new Error("SUPABASE_ANON_KEY is missing");
}

if (!supabaseServiceRoleKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing");
}

// Normal client for authentication operations
export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Admin client for server-side database operations
export const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);