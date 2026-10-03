import express from "express";
import cors from "cors";
import "dotenv/config";

// Validate required environment variables early and fail-fast with
// a helpful error message if something is missing. This prevents
// cryptic runtime errors later when services (Supabase/Redis/OAuth)
// are initialised.
import "./config/env.js";

// Connect to Redis early so the connection is ready before any
// route handler or middleware that depends on it is called.
import "./config/redis.js";

import passport from "passport";
import { initGoogleOAuth } from "./config/google.js";
import { initMicrosoftOAuth } from "./config/microsoft.js";

import swaggerUi from "swagger-ui-express";
import swaggerJsdoc from "swagger-jsdoc";

import authRoutes from "./routes/auth.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import adminNotificationRoutes from "./routes/admin.notification.routes.js";
import supportRoutes from "./routes/support.routes.js";
import adminSupportRoutes from "./routes/admin.support.routes.js";
import feedbackRoutes from "./routes/feedback.routes.js";
import adminFeedbackRoutes from "./routes/admin.feedback.routes.js";
import internalRoutes from "./routes/internal.routes.js";
import { requestLogger } from "./middleware/requestLogger.middleware.js";

const app = express();

const PORT = process.env.PORT || 5000;

const FRONTEND_URL =
  process.env.FRONTEND_URL || "http://localhost:3000";

// --------------------------------------
// Middleware
// --------------------------------------

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Log every incoming request
app.use(requestLogger);

// --------------------------------------
// Passport
// --------------------------------------

app.use(passport.initialize());

// Initialize OAuth strategies after dotenv is loaded
initGoogleOAuth();
initMicrosoftOAuth();

// --------------------------------------
// Swagger configuration
// --------------------------------------

const swaggerOptions = {
  definition: {
    openapi: "3.0.0",

    info: {
      title: "Authentication API",
      version: "1.0.0",
      description:
        "Node.js + Express.js authentication API using Supabase, Gmail SMTP OTP, Google OAuth and Microsoft OAuth"
    },

    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: "Local development server"
      }
    ],

    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Enter the JWT access token returned by /login or /verify-otp"
        }
      }
    }
  },

  apis: [
    "./src/routes/*.js"
  ]
};

const swaggerSpec =
  swaggerJsdoc(swaggerOptions);

app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec)
);

// --------------------------------------
// Health check
// --------------------------------------

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Authentication API is running"
  });
});

// --------------------------------------
// Authentication routes
// --------------------------------------

app.use("/api/auth", authRoutes);

// --------------------------------------
// Notification routes
// --------------------------------------

app.use("/api/notifications", notificationRoutes);
app.use("/api/admin/notifications", adminNotificationRoutes);
app.use("/api/internal", internalRoutes);

// --------------------------------------
// Query / Support routes
// --------------------------------------

app.use("/api/support", supportRoutes);
app.use("/api/admin/support", adminSupportRoutes);

// --------------------------------------
// Feedback routes
// --------------------------------------

app.use("/api/feedback", feedbackRoutes);
app.use("/api/admin/feedback", adminFeedbackRoutes);

// --------------------------------------
// 404
// --------------------------------------

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found"
  });
});

// --------------------------------------
// Error handler
// --------------------------------------

app.use((err, req, res, next) => {
  console.error(err);

  res.status(500).json({
    success: false,
    message: "Internal server error"
  });
});

// --------------------------------------
// Start server
// --------------------------------------

app.listen(PORT, () => {
  console.log(
    `Authentication API running on http://localhost:${PORT}`
  );

  console.log(
    `Swagger documentation running on http://localhost:${PORT}/api-docs`
  );

  console.log(
    `Google OAuth login: http://localhost:${PORT}/api/auth/google`
  );

  console.log(
    `Microsoft OAuth login: http://localhost:${PORT}/api/auth/microsoft`
  );
});