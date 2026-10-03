import passport from "passport";
import { Strategy as MicrosoftStrategy } from "passport-microsoft";
import { supabaseAdmin } from "./supabase.js";

export const initMicrosoftOAuth = () => {
  console.log("======================================");
  console.log("🔥 Initializing Microsoft OAuth...");
  console.log("======================================");

  // --------------------------------------
  // Check environment variables
  // --------------------------------------

  
  // --------------------------------------
  // Microsoft Passport Strategy
  // --------------------------------------

  passport.use(
    "microsoft",

    new MicrosoftStrategy(
      {
        clientID:
          process.env.MICROSOFT_CLIENT_ID,

        clientSecret:
          process.env.MICROSOFT_CLIENT_SECRET,

        callbackURL:
          process.env.MICROSOFT_CALLBACK_URL,

        tenant: "common",

        authorizationURL:
          "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",

        tokenURL:
          "https://login.microsoftonline.com/common/oauth2/v2.0/token",

        scope: ["user.read"],
      },

      async (
        accessToken,
        refreshToken,
        profile,
        done
      ) => {
        console.log(
          "🔥🔥 MICROSOFT VERIFY CALLBACK CALLED"
        );

        try {
          // --------------------------------------
          // Microsoft profile
          // --------------------------------------

         
          // --------------------------------------
          // Get email
          // --------------------------------------

          const email =
            profile.emails?.[0]?.value ||
            profile._json?.mail ||
            profile._json?.userPrincipalName;

          // --------------------------------------
          // Get name
          // --------------------------------------

          const name =
            profile.displayName ||
            profile._json?.displayName ||
            "Microsoft User";

          // --------------------------------------
          // Validate email
          // --------------------------------------

          if (!email) {
            console.error(
              "❌ Microsoft email not found"
            );

            return done(
              new Error(
                "Microsoft account email was not provided"
              ),
              null
            );
          }

          // --------------------------------------
          // Normalize email
          // --------------------------------------

          const normalizedEmail = email
            .toLowerCase()
            .trim();

          console.log(
            "Microsoft email:",
            normalizedEmail
          );

          console.log(
            "Microsoft name:",
            name
          );

          // --------------------------------------
          // Find Supabase user
          // --------------------------------------

          console.log(
            "🔎 Searching Supabase user..."
          );

          const {
            data,
            error,
          } =
            await supabaseAdmin.auth.admin.listUsers();

          if (error) {
            console.error(
              "❌ Supabase list users error:",
              error
            );

            return done(error, null);
          }

          let user = data.users.find(
            (u) =>
              u.email
                ?.toLowerCase()
                .trim() === normalizedEmail
          );

          // --------------------------------------
          // Existing user
          // --------------------------------------

          if (user) {
            console.log(
              "✅ Existing Supabase user found:",
              user.id
            );
          }

          // --------------------------------------
          // Create user
          // --------------------------------------

          if (!user) {
            console.log(
              "🆕 User does not exist."
            );

            console.log(
              "Creating Supabase user..."
            );

            const {
              data: createdUser,
              error: createError,
            } =
              await supabaseAdmin.auth.admin.createUser(
                {
                  email: normalizedEmail,

                  email_confirm: true,

                  user_metadata: {
                    name,
                    provider: "microsoft",
                  },
                }
              );

            if (createError) {
              console.error(
                "❌ Supabase create user error:",
                createError
              );

              return done(
                createError,
                null
              );
            }

            user = createdUser.user;

            console.log(
              "✅ Microsoft user created:",
              user.id
            );
          }

          // --------------------------------------
          // Validate user
          // --------------------------------------

          if (!user) {
            return done(
              new Error(
                "Unable to find or create user"
              ),
              null
            );
          }

          // --------------------------------------
          // Upsert profile
          // --------------------------------------

          console.log(
            "🔎 Updating profiles table..."
          );

          const {
            error: profileError,
          } =
            await supabaseAdmin
              .from("profiles")
              .upsert(
                {
                  id: user.id,

                  name,

                  email:
                    user.email ||
                    normalizedEmail,

                  organization_name: "",

                  role: "user",

                  email_verified: true,
                },
                {
                  onConflict: "id",
                  ignoreDuplicates: true,
                }
              );

          if (profileError) {
            console.error(
              "❌ Profile upsert error:",
              profileError
            );

            return done(
              profileError,
              null
            );
          }

          // --------------------------------------
          // Successful authentication
          // --------------------------------------

          console.log(
            "======================================"
          );

          console.log(
            "✅ MICROSOFT AUTHENTICATION SUCCESSFUL"
          );

          console.log(
            "User ID:",
            user.id
          );

          console.log(
            "Email:",
            user.email
          );

          console.log(
            "Name:",
            name
          );

          console.log(
            "======================================"
          );

          return done(null, {
            id: user.id,

            email:
              user.email ||
              normalizedEmail,

            name,
          });
        } catch (error) {
          console.error(
            "❌ Microsoft OAuth error:",
            error
          );

          return done(
            error,
            null
          );
        }
      }
    )
  );

  console.log(
    "✅ Microsoft OAuth strategy initialized"
  );
};

export default passport;