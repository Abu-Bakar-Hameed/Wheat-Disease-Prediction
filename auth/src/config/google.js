import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { supabaseAdmin } from "./supabase.js";

export const initGoogleOAuth = () => {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL } = process.env;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_CALLBACK_URL) {
    console.warn("⚠️ Google OAuth environment variables are not fully set. Skipping Google OAuth initialization.");
    return;
  }

  console.log("🔥 Initializing Google OAuth...");

  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: GOOGLE_CALLBACK_URL
      },


      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;

          const name =
            profile.displayName ||
            profile.name?.givenName ||
            "Google User";

          if (!email) {
            return done(
              new Error("Google account does not provide an email"),
              null
            );
          }

          // Find existing Supabase user
          const { data, error } =
            await supabaseAdmin.auth.admin.listUsers();

          if (error) {
            return done(error, null);
          }

          let user = data.users.find(
            (u) => u.email?.toLowerCase() === email.toLowerCase()
          );

          // Create user if it doesn't exist
          if (!user) {
            const {
              data: created,
              error: createError
            } = await supabaseAdmin.auth.admin.createUser({
              email,
              email_confirm: true,
              user_metadata: {
                name,
                provider: "google"
              }
            });

            if (createError) {
              return done(createError, null);
            }

            user = created.user;
          }

          // --------------------------------------
          // Upsert profile row
          // --------------------------------------

          const { error: profileError } = await supabaseAdmin
            .from("profiles")
            .upsert(
              {
                id: user.id,
                name,
                email: user.email,
                organization_name: "",
                role: "user",
                email_verified: true
              },
              { onConflict: "id", ignoreDuplicates: true }
            );

          if (profileError) {
            console.error(
              "Google OAuth profile upsert error:",
              profileError
            );
            return done(profileError, null);
          }

          return done(null, {
            id: user.id,
            email: user.email,
            name
          });

        } catch (error) {
          console.error("Google OAuth error:", error);
          return done(error, null);
        }
      }
    )
  );
};

export default passport;
