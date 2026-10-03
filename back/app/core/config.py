"""
WheatGuard AI – Application Configuration
Loads all settings from environment variables / .env file.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Project root = directory that contains this file's grandparent package
BASE_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    """
    Central configuration object.
    All values can be overridden via environment variables or a .env file.
    """

    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
        protected_namespaces=("settings_",),   # suppress model_ namespace warnings
    )

    # ── Application ──────────────────────────────────────────────────────────
    app_name: str = Field(default="WheatGuard AI")
    app_version: str = Field(default="1.0.0")
    app_env: Literal["development", "staging", "production"] = Field(
        default="development"
    )
    debug: bool = Field(default=False)

    # ── API server ────────────────────────────────────────────────────────────
    api_host: str = Field(default="0.0.0.0")
    api_port: int = Field(default=8000)
    allowed_origins: list[str] = Field(
        default=["http://localhost:3000", "http://127.0.0.1:3000"]
    )

    # ── Supabase ──────────────────────────────────────────────────────────────
    supabase_url: str = Field(default="")
    supabase_anon_key: str = Field(default="")
    supabase_service_role_key: str = Field(default="")

    # ── JWT (must EXACTLY match the Node/Express auth backend's secret) ────────
    # This is used to verify the access token issued by signAccessToken() in
    # the Node backend's utils/jwt.js. If this value doesn't match that
    # backend's signing secret, every authenticated request here will fail
    # with 401 even for perfectly valid, freshly-issued tokens.
    jwt_secret_key: str = Field(default="", validation_alias="JWT_SECRET")
    jwt_algorithm: str = Field(default="HS256", validation_alias="JWT_ALGORITHM")

    # ── Model paths ───────────────────────────────────────────────────────────
    model_path: Path = Field(default=BASE_DIR / "models" / "best_model.pth")
    class_names_path: Path = Field(
        default=BASE_DIR / "models" / "class_names.json"
    )
    model_metadata_path: Path = Field(
        default=BASE_DIR / "models" / "model_metadata.json"
    )
    disease_info_path: Path = Field(
        default=BASE_DIR / "app" / "ml" / "disease_info.json"
    )

    # ── ML inference ─────────────────────────────────────────────────────────
    image_size: int = Field(default=224, ge=32, le=1024)
    confidence_threshold: float = Field(default=0.60, ge=0.0, le=1.0)
    top_k_predictions: int = Field(default=3, ge=1, le=10)
    device: Literal["auto", "cpu", "cuda"] = Field(default="auto")

    # ── Upload ────────────────────────────────────────────────────────────────
    max_upload_size_mb: int = Field(default=10, ge=1, le=100)
    allowed_extensions: list[str] = Field(
        default=["jpg", "jpeg", "png", "webp"]
    )

    # ── Training ──────────────────────────────────────────────────────────────
    epochs: int = Field(default=20, ge=1)
    batch_size: int = Field(default=32, ge=1)
    learning_rate: float = Field(default=1e-4, gt=0)
    weight_decay: float = Field(default=1e-4, ge=0)
    early_stopping_patience: int = Field(default=5, ge=1)
    random_seed: int = Field(default=42)
    data_dir: Path = Field(default=BASE_DIR / "data" / "raw")
    use_class_weights: bool = Field(default=True)
    train_split: float = Field(default=0.70)
    val_split: float = Field(default=0.15)
    test_split: float = Field(default=0.15)

    # ── MLflow ────────────────────────────────────────────────────────────────
    mlflow_tracking_uri: str = Field(default="mlruns")
    mlflow_experiment_name: str = Field(default="wheatguard-training")

    # ── OpenRouter LLM ───────────────────────────────────────────────────────
    # Server-side only. The key lives in .env and is never returned to the
    # browser: the chatbot talks to /api/v1/assistant/chat, which proxies the
    # completion to OpenRouter with these credentials.
    openrouter_api_key: str = Field(default="")
    openrouter_model: str = Field(default="stealth/space-bunny-alpha")
    openrouter_base_url: str = Field(default="https://openrouter.ai/api/v1")
    openrouter_timeout_seconds: float = Field(default=60.0, ge=5)
    # Attribution headers OpenRouter uses for app rankings / request routing.
    openrouter_app_url: str = Field(default="http://localhost:3000")
    openrouter_app_name: str = Field(default="WheatGuard AI")

    # ── Internal service-to-service ───────────────────────────────────────────
    # URL of the Node/Express auth backend — used to trigger email alerts
    auth_backend_url: str = Field(default="http://localhost:5000")
    # Shared secret — must match INTERNAL_API_SECRET in auth/.env
    internal_api_secret: str = Field(default="")

    # ── Weather risk (Open-Meteo — keyless, server-side only) ─────────────────
    # Real current + 7-day conditions feed the backend disease-weather scoring
    # engine. Open-Meteo needs no API key, so nothing secret ever reaches the
    # browser. Default coordinates are only a fallback when a user has not set
    # a profile location (explicitly labelled as "default location" in the UI).
    weather_provider_base_url: str = Field(
        default="https://api.open-meteo.com/v1/forecast"
    )
    weather_geocoding_url: str = Field(
        default="https://geocoding-api.open-meteo.com/v1/search"
    )
    weather_default_latitude: float = Field(default=31.52, ge=-90.0, le=90.0)
    weather_default_longitude: float = Field(default=74.36, ge=-180.0, le=180.0)
    weather_default_location_label: str = Field(default="Default field location")
    weather_timeout_seconds: float = Field(default=12.0, ge=2.0, le=60.0)
    # Per-location response cache — Open-Meteo updates ~hourly; re-fetching on
    # every dashboard poll would be wasteful.
    weather_cache_seconds: int = Field(default=600, ge=0, le=3600)

    # ── Disease alert emails (HIGH / CRITICAL predictions) ───────────────────
    # Delivery is delegated to the auth backend, which owns the Gmail SMTP
    # credentials (GMAIL_USER / GMAIL_APP_PASSWORD live in auth/.env only).
    # This service never touches a mailbox password; it only posts the alert
    # request to `auth_backend_url` guarded by `internal_api_secret`.
    email_alerts_enabled: bool = Field(default=True)
    # Bounded wait for the delivery handoff. The auth service answers only after
    # Gmail has accepted the message, so this covers one SMTP transaction
    # (a cold TLS connection has been observed at ~10s, a warm one ~3s).
    # Exceeding it never fails the prediction; it only reports "not sent".
    email_alert_timeout_seconds: float = Field(default=20.0, ge=2.0, le=60.0)
    # Development sink: when set (and APP_ENV is not "production") every disease
    # alert is re-routed to this mailbox so testing does not notify real farmers.
    # Deliberately ignored in production so a leftover .env value can never
    # silently re-point live alerts.
    email_test_recipient: str = Field(default="")

    # ── Calendar reminders ───────────────────────────────────────────────────
    # How often the in-process scheduler loop checks for due reminders that need
    # an in-app + email dispatch. A reminder also fires on an "on-open" sweep
    # when the user loads the Calendar, so this only bounds worst-case latency
    # while the server runs unattended. Floor at 15s to avoid hammering Supabase.
    reminder_check_seconds: int = Field(default=60, ge=15, le=3600)

    # ── Logging ───────────────────────────────────────────────────────────────
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = Field(
        default="INFO"
    )
    log_file: Path = Field(default=BASE_DIR / "logs" / "wheatguard.log")

    # ── Computed properties ───────────────────────────────────────────────────
    @property
    def max_upload_size_bytes(self) -> int:
        return self.max_upload_size_mb * 1024 * 1024

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @field_validator("allowed_origins", "allowed_extensions", mode="before")
    @classmethod
    def _parse_csv(cls, v: object) -> list[str]:
        """Accept both comma-separated strings and lists."""
        if isinstance(v, str):
            return [item.strip() for item in v.split(",") if item.strip()]
        return v  # type: ignore[return-value]

    @field_validator("train_split", "val_split", "test_split", mode="after")
    @classmethod
    def _validate_split(cls, v: float) -> float:
        if not 0 < v < 1:
            raise ValueError("Split values must be between 0 and 1 exclusive.")
        return v


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """
    Return a cached Settings singleton.
    Use this everywhere instead of instantiating Settings directly.
    """
    return Settings()


# Module-level convenience alias
settings = get_settings()