"""
WheatGuard AI – FastAPI Application Entry Point
Run with:  uvicorn app.main:app --reload
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import health, history, prediction, diseases, model_info, analytics, weather, reports, admin, preferences, users, calendar, retention, activity, assistant, share
from app.core.config import settings
from app.core.exceptions import (
    DatabaseError,
    ImageTooLargeError,
    InferenceError,
    InvalidImageError,
    ModelLoadError,
    ModelNotLoadedError,
    UnsupportedImageError,
    WheatGuardBaseError,
)
from app.core.logging import get_logger, setup_logging
from app.ml.inference import model_manager

# Initialise logging before anything else
setup_logging(level=settings.log_level, log_file=settings.log_file)
logger = get_logger(__name__)


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Application lifespan handler.

    On startup:
        - Load the AI model into memory (once).
        - Log environment and model status.

    On shutdown:
        - Log teardown.
    """
    logger.info("=" * 60)
    logger.info("  %s v%s  starting up", settings.app_name, settings.app_version)
    logger.info("  Environment : %s", settings.app_env)
    logger.info("  Debug mode  : %s", settings.debug)
    logger.info("=" * 60)

    # Load model (non-fatal if weights are absent – API starts in degraded mode)
    try:
        model_manager.load()
    except ModelLoadError as exc:
        logger.error("Model load error (API starting in degraded mode): %s", exc)
    except Exception as exc:
        logger.error("Unexpected error during model load: %s", exc, exc_info=True)

    if model_manager.is_loaded:
        logger.info(
            "Model ready: version=%s classes=%d device=%s",
            model_manager.metadata.get("model_version", "unknown"),
            model_manager.num_classes,
            model_manager.device,
        )
    else:
        logger.warning(
            "Model not loaded – predictions will be unavailable until "
            "training is complete and weights are placed at '%s'.",
            settings.model_path,
        )

    # Start the reminder dispatch scheduler (in-process asyncio loop). It also
    # runs one sweep immediately, so a reminder that came due while the server
    # was down is still delivered. Non-fatal if it can't start.
    reminder_task: asyncio.Task | None = None
    try:
        from app.ml.reminder_service import reminder_scheduler_loop

        reminder_task = asyncio.create_task(reminder_scheduler_loop())
    except Exception as exc:  # never let the scheduler block app startup
        logger.error("Reminder scheduler failed to start: %s", exc, exc_info=True)

    yield  # ── Application runs here ─────────────────────────────────────────

    if reminder_task is not None:
        reminder_task.cancel()
        try:
            await reminder_task
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            logger.error("Reminder scheduler teardown error: %s", exc)

    logger.info("%s shutting down.", settings.app_name)


# ── Application factory ───────────────────────────────────────────────────────

def create_app() -> FastAPI:
    """Construct and configure the FastAPI application."""

    app = FastAPI(
        title=settings.app_name,
        description=(
            "## WheatGuard AI\n"
            "**AI-Powered Wheat Disease Detection and Recommendation System**\n\n"
            "Upload a wheat-leaf photograph and receive:\n"
            "- Disease prediction with confidence score\n"
            "- Top-3 candidate classes\n"
            "- Grad-CAM visual explanation\n"
            "- Agronomic guidance and treatment recommendations\n\n"
            "> **Disclaimer**: This system provides AI Predictions only. "
            "Always consult a qualified agricultural expert for confirmation "
            "before applying any treatment."
        ),
        version=settings.app_version,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )

    # ── CORS ──────────────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

    # ── Global exception handlers ─────────────────────────────────────────────
    _register_exception_handlers(app)

    # ── Routers ───────────────────────────────────────────────────────────────
    app.include_router(health.router)
    app.include_router(prediction.router)
    app.include_router(analytics.router)   # MUST be before history
    app.include_router(history.router)
    app.include_router(diseases.router)
    app.include_router(model_info.router)
    app.include_router(weather.router)     # /api/v1/weather/*
    app.include_router(reports.router)     # /api/v1/reports/*
    app.include_router(admin.router)       # /api/v1/admin/*
    app.include_router(preferences.router) # /api/v1/preferences
    app.include_router(assistant.router)   # /api/v1/assistant/*  (built-in AI chat)
    app.include_router(users.router)       # /api/v1/users/me
    app.include_router(calendar.router)    # /api/v1/users/me/calendar + /reminders
    app.include_router(activity.router)    # /api/v1/activity/events (user activity tracking)
    app.include_router(retention.router)   # /api/v1/admin/retention/*
    app.include_router(share.router)       # /api/v1/share/{id}  (public share view)

    return app


def _register_exception_handlers(app: FastAPI) -> None:
    """
    Map domain exceptions and unexpected errors to clean JSON HTTP responses.
    Internal stack traces are NEVER exposed to API consumers.
    """

    @app.exception_handler(ModelNotLoadedError)
    async def model_not_loaded_handler(
        request: Request, exc: ModelNotLoadedError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"error": "model_unavailable", "detail": exc.message},
        )

    @app.exception_handler(ModelLoadError)
    async def model_load_handler(
        request: Request, exc: ModelLoadError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": "model_load_error", "detail": exc.message},
        )

    @app.exception_handler(InvalidImageError)
    async def invalid_image_handler(
        request: Request, exc: InvalidImageError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"error": "invalid_image", "detail": exc.message},
        )

    @app.exception_handler(UnsupportedImageError)
    async def unsupported_image_handler(
        request: Request, exc: UnsupportedImageError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            content={"error": "unsupported_image", "detail": exc.message},
        )

    @app.exception_handler(ImageTooLargeError)
    async def image_too_large_handler(
        request: Request, exc: ImageTooLargeError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            content={"error": "image_too_large", "detail": exc.message},
        )

    @app.exception_handler(InferenceError)
    async def inference_error_handler(
        request: Request, exc: InferenceError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": "inference_error", "detail": exc.message},
        )

    @app.exception_handler(DatabaseError)
    async def database_error_handler(
        request: Request, exc: DatabaseError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"error": "database_error", "detail": exc.message},
        )

    @app.exception_handler(WheatGuardBaseError)
    async def wheatguard_base_handler(
        request: Request, exc: WheatGuardBaseError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=exc.http_status,
            content={"error": "wheatguard_error", "detail": exc.message},
        )

    @app.exception_handler(Exception)
    async def generic_exception_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:
        # Log the full traceback server-side, but never expose it to the client
        logger.error(
            "Unhandled exception on %s %s: %s",
            request.method,
            request.url.path,
            exc,
            exc_info=True,
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": "internal_server_error",
                "detail": (
                    "An unexpected error occurred. "
                    "Please try again or contact support."
                ),
            },
        )


# ── Module-level app instance (used by uvicorn) ───────────────────────────────
app = create_app()
