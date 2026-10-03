"""
WheatGuard AI – User Profile & Settings Routes

Endpoints:
  GET    /api/v1/users/me                   — fetch own profile
  PATCH  /api/v1/users/me                   — update own profile (JSON or multipart)
  POST   /api/v1/users/me/change-password   — change password via the auth service
  GET    /api/v1/users/me/settings          — fetch email-alert / unit / language settings
  PATCH  /api/v1/users/me/settings          — save email-alert / unit / language settings

Storage:
  - profiles table      → avatar_url (column added via migration), name, organization_name
  - user_settings table → alert toggle + unit + language settings
  - Avatar files        → Supabase Storage bucket "avatars" (public)
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, TypeVar

import httpx
import re
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field, field_validator

from app.core.auth import get_current_user_claims, get_current_user_id
from app.core.config import settings
from app.core.logging import get_logger
from app.core.totp import generate_secret, otpauth_uri, verify_totp
from app.database.database import get_supabase_client
from app.database.storage import delete_file_from_storage

router = APIRouter(prefix="/api/v1/users", tags=["Users"])
logger = get_logger(__name__)

# We store avatars in Supabase Storage and the URL in the existing
# `profiles` table (avatar_url column added by migration below).
# `user_settings` is a separate table for alert toggles / display prefs.
_PROFILES_TABLE = "profiles"
_SETTINGS_TABLE = "user_settings"
_AVATAR_BUCKET  = "avatars"

# ── Pydantic models ───────────────────────────────────────────────────────────

class UserProfileResponse(BaseModel):
    id: str
    email: str
    full_name:  str | None = None
    phone:      str | None = None
    farm_name:  str | None = None
    location:   str | None = None
    bio:        str | None = None
    avatar_url: str | None = None
    member_since:        str | None = None
    total_scans:         int | None = None
    high_severity_count: int | None = None


class AppearanceSettings(BaseModel):
    """User-specific chatbot/dashboard appearance.

    Stored as a single JSONB blob in the `appearance` column of `user_settings`.
    Kept deliberately separate from the Chatbot *feature* toggles below: those
    control what the assistant can do, these control how it looks (§34).
    """

    theme: str = "system"

    # Colors (validated #RRGGBB on the client; normalized again in the route)
    primary_color: str = "#15803d"
    accent_color: str = "#15803d"
    chatbot_color: str = "#15803d"
    user_message_color: str = "#15803d"
    ai_message_color: str = "#ffffff"
    background_color: str = "#f8fafc"

    # Chatbot layout
    chatbot_open_style: str = "right_sidebar"
    panel_width: str = "medium"
    panel_height: str = "tall"
    border_radius: str = "large"
    overlay: str = "medium"

    # Chat appearance
    message_style: str = "rounded"
    chat_density: str = "comfortable"
    font_size: str = "medium"
    message_bubble_width: str = "wide"

    # Header
    show_chatbot_name: bool = True
    show_ai_icon: bool = True
    compact_header: bool = False
    header_style: str = "standard"

    # Input box
    input_rounded: bool = True
    input_border: bool = True
    input_auto_grow: bool = True
    send_button_style: str = "icon"


class PredictionPreferences(BaseModel):
    """Per-user prediction-result display preferences (Settings → Prediction).

    Stored as one JSONB blob in `prediction_preferences`. The `show_*` flags are
    presentation-only — they hide already-generated content at the view layer and
    never touch the ML pipeline, Grad-CAM generation or confidence math.

    Every field here is ENFORCED somewhere real:
    * default_method pre-selects the detection page's analysis options
      (quick = no Grad-CAM/top-3, standard = Grad-CAM/top-3, detailed = Grad-CAM/top-5),
    * save_auto maps to /predict's save_history flag,
    * save_images maps to /predict's store_image flag,
    * open_result_auto decides whether detection jumps to the result page or
      shows the inline summary first (default True = the app's long-standing
      behaviour, so turning it OFF is the opt-in change).
    """

    default_method: str = "standard"
    save_auto: bool = True
    save_images: bool = True
    show_gradcam: bool = True
    show_top: bool = True
    show_ai_report: bool = True
    low_confidence_warning: bool = True
    open_result_auto: bool = True

    @field_validator("default_method")
    @classmethod
    def _valid_method(cls, v: str) -> str:
        # "auto" is the legacy stored value from before the control was wired;
        # it means the app default (standard) and keeps old rows valid.
        return v if v in ("auto", "quick", "standard", "detailed") else "standard"


class WeatherPreferences(BaseModel):
    """Weather tile + risk-notification preferences (Settings → Weather & Risk).

    `show_on_dashboard` is applied at the view layer. `forecast_period` only
    offers ranges the weather provider supports. Weather-risk notification
    toggles are kept distinct from disease probability in all copy.
    """

    notify_weather_risk: bool = True
    notify_disease_risk: bool = True
    high_risk_alerts: bool = True
    forecast_period: str = "7d"
    show_on_dashboard: bool = True

    @field_validator("forecast_period")
    @classmethod
    def _valid_period(cls, v: str) -> str:
        # Only horizons the forecast provider actually supplies.
        return v if v in ("3d", "5d", "7d") else "7d"


# Lead-time buckets stored as calendar_preferences.default_lead_time. The
# minutes each maps to pre-fills the new-reminder form's notification_offset.
_LEAD_TIME_MINUTES = {"none": 0, "1h": 60, "1d": 1440, "2d": 2880, "1w": 10080}

# calendar_preferences.default_view values, aligned with CalendarView's real
# render modes (it ships Daily/Weekly/Monthly/Yearly grids today).
_CAL_VIEWS = ("daily", "weekly", "monthly", "yearly")


class CalendarPreferences(BaseModel):
    """Reminder + calendar-view preferences (Settings → Calendar & Reminders).

    All real: reminders_enabled and email gate the reminder dispatcher
    (reminder_service), default_lead_time pre-fills the new-reminder notify
    offset, the suggest_* flags gate the follow-up surfaces on the history and
    weather pages, and default_view initialises CalendarView's grid."""

    reminders_enabled: bool = True
    # Default TRUE on purpose: reminder dispatch e-mails today, so wiring the
    # toggle must not silently switch existing users' e-mails off. The value is
    # only stored when the user actively changes it.
    in_app: bool = True
    email: bool = True
    default_lead_time: str = "1d"
    suggest_prediction_followup: bool = True
    suggest_weather_followup: bool = True
    default_view: str = "monthly"

    @field_validator("default_lead_time")
    @classmethod
    def _valid_lead(cls, v: str) -> str:
        return v if v in _LEAD_TIME_MINUTES else "1d"

    @field_validator("default_view")
    @classmethod
    def _valid_view(cls, v: str) -> str:
        # Accept the legacy short forms the first cut of the UI stored.
        legacy = {"day": "daily", "week": "weekly", "month": "monthly", "year": "yearly"}
        v = legacy.get(v, v)
        return v if v in _CAL_VIEWS else "monthly"


class PrivacyPreferences(BaseModel):
    """Reserved container for privacy controls (Settings → Privacy & Data).

    The Privacy & Data section is action-based (download account data, delete
    all history, manage shared reports, clear assistant conversations) rather
    than toggle-based, so there are no fake switches backed by a missing
    enforcement layer. The column exists so a real control can be added later
    without another migration.
    """


# Models the assistant offers when the user has NOT brought their own key
# (they run on the server's shared key, so only free-tier variants are listed
# to keep shared-key cost at zero). An unknown/unavailable id degrades to the
# rule-based knowledge base exactly like any other upstream failure.
CHAT_MODEL_OPTIONS = (
    "",  # empty = server default (OPENROUTER_MODEL)
    "meta-llama/llama-3.3-70b-instruct:free",
    "google/gemini-2.0-flash-exp:free",
    "deepseek/deepseek-chat-v3-0324:free",
    "qwen/qwen-2.5-72b-instruct:free",
)


class UserSettingsResponse(BaseModel):
    email_high_severity_alerts: bool = True
    email_weekly_digest:        bool = False
    email_report_ready:         bool = True
    units:    str = "metric"
    language: str = "en"
    # Chatbot feature availability (kept flat — enforced by the assistant route)
    voice_enabled:              bool = True
    image_upload_enabled:       bool = True
    recent_predictions_enabled: bool = True
    chat_notifications_enabled: bool = True
    # General: locale / formatting / navigation (flat scalar columns)
    timezone: str | None = None
    date_format:        str = "DD/MM/YYYY"
    time_format:        str = "24"
    first_day_of_week:  str = "monday"
    default_start_page: str = "/dashboard"
    remember_last_page: bool = False
    show_help_tips:     bool = True
    last_visited_page:  str | None = None
    # AI Chatbot account integrations (flat columns). The OpenRouter key itself
    # is NEVER returned — only whether one is configured — so a settings GET
    # can't leak the secret to anyone reading the response.
    chat_model: str = ""
    openrouter_key_configured: bool = False
    # Written only by the auth service; surfaced so Security UI can reflect state.
    two_factor_enabled: bool = False
    # Appearance + per-feature preference groups (each a single nested object →
    # one JSONB column, deep-merged on PATCH like `appearance`).
    appearance: AppearanceSettings = Field(default_factory=AppearanceSettings)
    prediction_preferences: PredictionPreferences = Field(default_factory=PredictionPreferences)
    weather_preferences:    WeatherPreferences    = Field(default_factory=WeatherPreferences)
    calendar_preferences:   CalendarPreferences   = Field(default_factory=CalendarPreferences)
    privacy_preferences:    PrivacyPreferences    = Field(default_factory=PrivacyPreferences)


class UserSettingsUpdate(BaseModel):
    email_high_severity_alerts: bool | None = None
    email_weekly_digest:        bool | None = None
    email_report_ready:         bool | None = None
    units:    str | None = Field(default=None, max_length=20)
    language: str | None = Field(default=None, max_length=10)
    voice_enabled:              bool | None = None
    image_upload_enabled:       bool | None = None
    recent_predictions_enabled: bool | None = None
    chat_notifications_enabled: bool | None = None
    timezone:           str | None = Field(default=None, max_length=64)
    date_format:        str | None = Field(default=None, max_length=16)
    time_format:        str | None = Field(default=None, max_length=4)
    first_day_of_week:  str | None = Field(default=None, max_length=16)
    default_start_page: str | None = Field(default=None, max_length=64)
    remember_last_page: bool | None = None
    show_help_tips:     bool | None = None
    last_visited_page:  str | None = Field(default=None, max_length=64)
    # Bring-your-own assistant key/model. `None` = leave stored value untouched
    # (PATCH semantics); empty string = clear it. Keys are write-only — they
    # never appear in any response, only in the masked `configured` flag.
    openrouter_api_key: str | None = Field(default=None, max_length=128)
    chat_model:         str | None = Field(default=None, max_length=64)

    @field_validator("chat_model")
    @classmethod
    def _valid_chat_model(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        return v if v in CHAT_MODEL_OPTIONS else ""

    @field_validator("openrouter_api_key")
    @classmethod
    def _valid_api_key(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if not v:
            return ""
        # OpenRouter keys are ASCII token material; reject anything with
        # whitespace/control characters rather than storing surprises.
        if not re.fullmatch(r"[A-Za-z0-9_.\-]{16,128}", v):
            raise ValueError("API key format looks invalid (16–128 letters, digits, '-', '_', '.').")
        return v
    appearance:             AppearanceSettings  | None = None
    prediction_preferences: PredictionPreferences | None = None
    weather_preferences:    WeatherPreferences    | None = None
    calendar_preferences:   CalendarPreferences   | None = None
    privacy_preferences:    PrivacyPreferences    | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password:     str = Field(min_length=8)


class ChangeEmailRequest(BaseModel):
    new_email:        str = Field(min_length=6, max_length=254)
    current_password: str = Field(min_length=1)


class DeleteAccountRequest(BaseModel):
    password: str = Field(min_length=1)


class TwoFactorCodeRequest(BaseModel):
    """Body for enabling/disabling 2FA: the 6-digit authenticator code that
    proves the user holds the device the shared secret was enrolled on."""
    code: str = Field(min_length=4, max_length=10)

    @field_validator("code")
    @classmethod
    def _digits(cls, v: str) -> str:
        digits = "".join(c for c in v if c.isdigit())
        if len(digits) < 6:
            raise ValueError("Enter the 6-digit code from your authenticator app.")
        return digits


_SETTINGS_DEFAULTS = UserSettingsResponse()

# ── Helpers ───────────────────────────────────────────────────────────────────

def _now() -> str:
    """ISO-8601 UTC timestamp.

    PostgREST casts the JSON string into the `timestamptz` column, so the SQL
    literal "now()" is rejected as invalid input syntax and fails the ENTIRE
    upsert. A real timestamp must be sent instead.
    """
    return datetime.now(timezone.utc).isoformat()


def _get_profile_row(user_id: str) -> dict[str, Any]:
    """Return the profiles row for user_id, or {} if missing."""
    try:
        client = get_supabase_client()
        resp = (
            client.table(_PROFILES_TABLE)
            .select("*")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        return resp.data or {}
    except Exception as exc:
        logger.warning("Could not read profiles: %s", exc)
        return {}


def _upsert_profile_fields(user_id: str, fields: dict[str, Any]) -> dict[str, Any]:
    """Patch only the provided fields on the profiles row."""
    try:
        client = get_supabase_client()
        # Map frontend field names → profiles column names
        col_map = {
            "full_name": "name",
            "farm_name": "organization_name",
            "phone":     "phone",
            "location":  "location",
            "bio":       "bio",
            "avatar_url":"avatar_url",
        }
        payload: dict[str, Any] = {"id": user_id}
        for k, v in fields.items():
            col = col_map.get(k, k)
            payload[col] = v

        # `profiles` is the auth-managed table, so `updated_at` may or may not be
        # exposed. Try with it, then fall back to without rather than losing the
        # whole profile write.
        try:
            resp = (
                client.table(_PROFILES_TABLE)
                .upsert({**payload, "updated_at": _now()}, on_conflict="id")
                .execute()
            )
        except Exception as inner:
            logger.warning(
                "profiles upsert with updated_at failed (%s); retrying without it", inner
            )
            resp = (
                client.table(_PROFILES_TABLE)
                .upsert(payload, on_conflict="id")
                .execute()
            )
        if resp.data:
            return resp.data[0]
    except Exception as exc:
        logger.error("Could not upsert profiles: %s", exc)
    return {**fields, "id": user_id}


def _bool_or(value: Any, default: bool) -> bool:
    """Coerce a stored value to bool; fall back to `default` when null/missing."""
    return value if isinstance(value, bool) else default


def _parse_appearance(raw: Any) -> AppearanceSettings:
    """Build AppearanceSettings from a stored JSONB value, ignoring unknown keys
    and falling back to defaults for anything missing/invalid."""
    if not isinstance(raw, dict):
        return AppearanceSettings()
    valid = set(AppearanceSettings.model_fields.keys())
    clean = {k: v for k, v in raw.items() if k in valid}
    try:
        return AppearanceSettings(**clean)
    except Exception:
        return AppearanceSettings()


_ModelT = TypeVar("_ModelT", bound=BaseModel)


def _parse_group(raw: Any, model: type[_ModelT]) -> _ModelT:
    """Generic JSONB-group parser: build `model` from a stored dict, ignoring
    unknown keys and falling back to the model defaults for anything missing or
    invalid. Shared by every nested preference group (prediction/weather/…)."""
    if not isinstance(raw, dict):
        return model()
    valid = set(model.model_fields.keys())
    clean = {k: v for k, v in raw.items() if k in valid}
    try:
        return model(**clean)
    except Exception:
        return model()


# Columns introduced by the settings-restructure migration. If the migration has
# not been applied yet, PostgREST rejects the whole row; we drop these (plus the
# older optional ones) and retry so core email/unit/feature settings still save.
_OPTIONAL_SETTINGS_COLUMNS = {
    "appearance", "prediction_preferences", "weather_preferences",
    "calendar_preferences", "privacy_preferences",
    "timezone", "date_format", "time_format", "first_day_of_week",
    "default_start_page", "remember_last_page", "show_help_tips", "last_visited_page",
    "voice_enabled", "image_upload_enabled", "recent_predictions_enabled",
    "chat_notifications_enabled",
    "openrouter_api_key", "chat_model", "password_changed_at",
    "totp_secret", "two_factor_enabled",
}

# Keys present in the settings RESPONSE that are computed from other columns
# and must never be written back as if they were columns.
_COMPUTED_SETTINGS_KEYS = {"openrouter_key_configured"}


def _get_settings_row(user_id: str) -> dict[str, Any]:
    try:
        client = get_supabase_client()
        resp = (
            client.table(_SETTINGS_TABLE)
            .select("*")
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        return resp.data or {}
    except Exception as exc:
        logger.warning("Could not read user_settings: %s", exc)
        return {}


def _upsert_settings_row(user_id: str, fields: dict[str, Any]) -> None:
    client = get_supabase_client()
    try:
        payload = {"user_id": user_id, **fields, "updated_at": _now()}
        client.table(_SETTINGS_TABLE).upsert(payload, on_conflict="user_id").execute()
    except Exception as exc:
        logger.error("user_settings upsert failed: %s", exc)
        # Graceful degradation: if a newer column has not been created yet
        # (migration not applied), PostgREST rejects the ENTIRE row, which would
        # silently break every other setting too. Retry without the optional
        # columns so the core email/unit/feature-toggle settings still persist,
        # and log a clear pointer to run the migration.
        reduced = {k: v for k, v in fields.items() if k not in _OPTIONAL_SETTINGS_COLUMNS}
        if reduced != fields:
            try:
                payload = {"user_id": user_id, **reduced, "updated_at": _now()}
                client.table(_SETTINGS_TABLE).upsert(payload, on_conflict="user_id").execute()
                logger.warning(
                    "Saved user_settings WITHOUT the newer columns — apply the "
                    "settings-restructure migration in back/supabase/apply_all.sql "
                    "(ALTER TABLE user_settings ADD COLUMN …)."
                )
            except Exception as exc2:
                logger.error("user_settings retry upsert failed: %s", exc2)


def _count_scans(user_id: str) -> tuple[int, int]:
    try:
        client = get_supabase_client()
        total = (client.table("predictions").select("id", count="exact")
                 .eq("user_id", user_id).execute()).count or 0
        high  = (client.table("predictions").select("id", count="exact")
                 .eq("user_id", user_id)
                 .in_("severity", ["high", "critical"]).execute()).count or 0
        return total, high
    except Exception:
        return 0, 0


def _upload_avatar(user_id: str, file: UploadFile) -> str | None:
    try:
        content = file.file.read()
        ext  = os.path.splitext(file.filename or "avatar.jpg")[1] or ".jpg"
        path = f"{user_id}/avatar{ext}"
        client = get_supabase_client()
        try:
            client.storage.from_(_AVATAR_BUCKET).remove([path])
        except Exception:
            pass
        client.storage.from_(_AVATAR_BUCKET).upload(
            path, content,
            file_options={"content-type": file.content_type or "image/jpeg", "upsert": "true"},
        )
        url = client.storage.from_(_AVATAR_BUCKET).get_public_url(path)
        if isinstance(url, str) and url.startswith("http"):
            return f"{url}?t={uuid.uuid4().hex[:8]}"
        return None
    except Exception as exc:
        logger.warning("Avatar upload failed (non-fatal): %s", exc)
        return None


def _build_profile_response(
    user_id: str, claims: dict[str, Any], row: dict[str, Any]
) -> UserProfileResponse:
    total, high = _count_scans(user_id)
    return UserProfileResponse(
        id=user_id,
        email=str(claims.get("email") or row.get("email") or ""),
        full_name=row.get("name") or claims.get("name"),
        phone=row.get("phone"),
        farm_name=row.get("organization_name"),
        location=row.get("location"),
        bio=row.get("bio"),
        avatar_url=row.get("avatar_url"),
        member_since=str(row.get("created_at") or ""),
        total_scans=total,
        high_severity_count=high,
    )


# ── GET /api/v1/users/me ─────────────────────────────────────────────────────

@router.get("/me", response_model=UserProfileResponse, status_code=status.HTTP_200_OK,
            summary="Get current user profile")
async def get_profile(claims: dict[str, Any] = Depends(get_current_user_claims)) -> UserProfileResponse:
    user_id = str(claims["sub"])
    row = _get_profile_row(user_id)
    return _build_profile_response(user_id, claims, row)


# ── PATCH /api/v1/users/me ────────────────────────────────────────────────────

@router.patch("/me", response_model=UserProfileResponse, status_code=status.HTTP_200_OK,
              summary="Update current user profile")
async def update_profile(
    full_name: str | None = Form(default=None),
    phone:     str | None = Form(default=None),
    farm_name: str | None = Form(default=None),
    location:  str | None = Form(default=None),
    bio:       str | None = Form(default=None),
    avatar:    UploadFile | None = File(default=None),
    claims: dict[str, Any] = Depends(get_current_user_claims),
) -> UserProfileResponse:
    user_id = str(claims["sub"])

    fields: dict[str, Any] = {}
    if full_name is not None: fields["full_name"] = full_name.strip() or None
    if phone     is not None: fields["phone"]     = phone.strip()     or None
    if farm_name is not None: fields["farm_name"] = farm_name.strip() or None
    if location  is not None: fields["location"]  = location.strip()  or None
    if bio       is not None: fields["bio"]       = bio.strip()       or None

    if avatar and avatar.filename:
        url = _upload_avatar(user_id, avatar)
        if url:
            fields["avatar_url"] = url

    _upsert_profile_fields(user_id, fields)
    row = _get_profile_row(user_id)
    return _build_profile_response(user_id, claims, row)


# ── Internal relay helpers ───────────────────────────────────────────────────

async def _post_internal(
    path: str,
    body: dict[str, Any],
    *,
    not_configured: str,
    timeout: float = 15.0,
) -> tuple[int, dict[str, Any]]:
    """POST to the auth service's shared-secret internal API and return
    (status, parsed-json-dict). Raises 503 when the secret is missing or the
    service is unreachable, so callers always fail honestly instead of
    silently pretending the operation happened."""
    if not settings.internal_api_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=not_configured
        )
    url = f"{settings.auth_backend_url.rstrip('/')}{path}"
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                url, json=body, headers={"x-internal-secret": settings.internal_api_secret}
            )
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail="Auth service unreachable.") from exc
    try:
        data = resp.json()
        if not isinstance(data, dict):
            data = {}
    except Exception:
        data = {}
    return resp.status_code, data


def _user_error(resp_status: int, data: dict[str, Any], fallback: str) -> HTTPException:
    """Turn an auth-service failure into a client-safe HTTPException. The
    service's own messages are user-safe ("current password is incorrect"
    etc.); anything unexpected collapses to a 502 with the fallback text."""
    detail = str(data.get("message") or data.get("error") or fallback)
    code = resp_status if resp_status in (400, 401, 403, 404, 409, 429) else 502
    return HTTPException(status_code=code, detail=detail)


def _stamp_password_changed(user_id: str) -> None:
    """Set user_settings.password_changed_at to NOW.

    Both APIs reject any token whose iat predates this stamp (core/auth.py on
    FastAPI, auth.middleware.js on the auth service) — that IS the
    "sign out everywhere" mechanism. Best-effort: on a password change the
    credentials are already updated, so a stamp failure must not fail the
    request; it only softens the invalidation window.
    """
    try:
        client = get_supabase_client()
        client.table(_SETTINGS_TABLE).upsert(
            {"user_id": user_id, "password_changed_at": _now(), "updated_at": _now()},
            on_conflict="user_id",
        ).execute()
    except Exception as exc:
        logger.warning("could not stamp password_changed_at for user=%s: %s", user_id, exc)


# ── POST /api/v1/users/me/change-password ────────────────────────────────────

@router.post("/me/change-password", status_code=status.HTTP_200_OK,
             summary="Change current user password")
async def change_password(
    body: ChangePasswordRequest,
    claims: dict[str, Any] = Depends(get_current_user_claims),
) -> dict[str, str]:
    """Forward a password change to the auth service's internal endpoint.

    FastAPI has already validated the caller's JWT; the auth service re-checks
    the CURRENT password before it updates. The call is authenticated with the
    shared INTERNAL_API_SECRET (never a browser-reachable route) so only this
    backend can trigger it, and the raw user id can't be forged.

    A successful change also invalidates every previously issued token —
    including this caller's — so the client must sign in again (the message
    says so).
    """
    user_id = str(claims["sub"])
    resp_status, data = await _post_internal(
        "/api/internal/change-password",
        {
            "user_id": user_id,
            "current_password": body.current_password,
            "new_password": body.new_password,
        },
        not_configured="Password change unavailable: auth service not configured.",
    )
    if resp_status != 200:
        raise _user_error(resp_status, data, "Password change failed.")
    _stamp_password_changed(user_id)
    return {"message": "Password changed successfully. Please sign in again."}


# ── GET /api/v1/users/me/settings ────────────────────────────────────────────

# Nested JSONB groups that are deep-merged on PATCH (so a partial update never
# wipes fields the client didn't send). `appearance` was the original one; the
# restructure adds four more and they all behave identically.
_MERGED_GROUPS = (
    "appearance",
    "prediction_preferences",
    "weather_preferences",
    "calendar_preferences",
    "privacy_preferences",
)


def _sanitize_nav_path(value: str) -> str | None:
    """Allow only an in-app `/dashboard` route path. Reject anything that could
    act as an external or protocol-relative redirect (stored open-redirect via
    the default/last-page settings)."""
    v = (value or "").strip()
    if not v.startswith("/dashboard") or "://" in v or v.startswith("//"):
        return None
    v = v.split("?", 1)[0].split("#", 1)[0]
    return v or None


def _build_settings_response(row: dict[str, Any]) -> UserSettingsResponse:
    """Map a raw user_settings row (or {} for a fresh user) to the response, with
    every safe default applied in ONE place so GET and PATCH never diverge."""
    if not row:
        return UserSettingsResponse()
    return UserSettingsResponse(
        email_high_severity_alerts=_bool_or(row.get("email_high_severity_alerts"), True),
        email_weekly_digest=_bool_or(row.get("email_weekly_digest"), False),
        email_report_ready=_bool_or(row.get("email_report_ready"), True),
        units=row.get("units") or "metric",
        language=row.get("language") or "en",
        voice_enabled=_bool_or(row.get("voice_enabled"), True),
        image_upload_enabled=_bool_or(row.get("image_upload_enabled"), True),
        recent_predictions_enabled=_bool_or(row.get("recent_predictions_enabled"), True),
        chat_notifications_enabled=_bool_or(row.get("chat_notifications_enabled"), True),
        timezone=row.get("timezone"),
        date_format=row.get("date_format") or "DD/MM/YYYY",
        time_format=row.get("time_format") or "24",
        first_day_of_week=row.get("first_day_of_week") or "monday",
        default_start_page=row.get("default_start_page") or "/dashboard",
        remember_last_page=_bool_or(row.get("remember_last_page"), False),
        show_help_tips=_bool_or(row.get("show_help_tips"), True),
        last_visited_page=row.get("last_visited_page"),
        chat_model=row.get("chat_model") or "",
        openrouter_key_configured=bool(row.get("openrouter_api_key")),
        two_factor_enabled=_bool_or(row.get("two_factor_enabled"), False),
        appearance=_parse_appearance(row.get("appearance")),
        prediction_preferences=_parse_group(row.get("prediction_preferences"), PredictionPreferences),
        weather_preferences=_parse_group(row.get("weather_preferences"), WeatherPreferences),
        calendar_preferences=_parse_group(row.get("calendar_preferences"), CalendarPreferences),
        privacy_preferences=_parse_group(row.get("privacy_preferences"), PrivacyPreferences),
    )


@router.get("/me/settings", response_model=UserSettingsResponse, status_code=status.HTTP_200_OK,
            summary="Get user settings")
async def get_settings(user_id: str = Depends(get_current_user_id)) -> UserSettingsResponse:
    return _build_settings_response(_get_settings_row(user_id))


# ── PATCH /api/v1/users/me/settings ──────────────────────────────────────────

@router.patch("/me/settings", response_model=UserSettingsResponse, status_code=status.HTTP_200_OK,
              summary="Update user settings")
async def update_settings(
    body: UserSettingsUpdate,
    user_id: str = Depends(get_current_user_id),
) -> UserSettingsResponse:
    current = _build_settings_response(_get_settings_row(user_id))
    merged = current.model_dump()
    # `exclude_unset` (not `exclude_none`) gives true PATCH semantics: only the
    # fields the client actually sent are applied. This preserves stored values
    # for anything omitted, lets an explicit `null` (e.g. timezone -> auto)
    # through, and — because Pydantic propagates exclude_unset into nested
    # models — means a partial group update (one `show_*` flag) no longer
    # overwrites the group's other fields with their model defaults.
    updates = body.model_dump(exclude_unset=True)

    # Write-only key/model normalisation: empty string clears the column,
    # omitted leaves it untouched (exclude_unset above already guarantees that).
    if "openrouter_api_key" in updates:
        updates["openrouter_api_key"] = (updates["openrouter_api_key"] or "").strip() or None
    if "chat_model" in updates:
        updates["chat_model"] = (updates["chat_model"] or "").strip() or None

    # Deep-merge each nested JSONB group over the stored value.
    for key in _MERGED_GROUPS:
        group_update = updates.pop(key, None)
        if isinstance(group_update, dict):
            merged[key] = {**(merged.get(key) or {}), **group_update}

    # Guard the navigation-path settings against a stored redirect.
    if "default_start_page" in updates:
        updates["default_start_page"] = _sanitize_nav_path(updates["default_start_page"]) or "/dashboard"
    if "last_visited_page" in updates:
        updates["last_visited_page"] = _sanitize_nav_path(updates["last_visited_page"])

    merged.update(updates)
    # Computed response fields are not columns — never write them back.
    payload = {k: v for k, v in merged.items() if k not in _COMPUTED_SETTINGS_KEYS}
    _upsert_settings_row(user_id, payload)
    return _build_settings_response(payload)


# ── GET /api/v1/users/me/export ──────────────────────────────────────────────

_PREDICTION_EXPORT_COLUMNS = (
    "id, predicted_class, confidence, confidence_pct, severity, "
    "recommendation, model_version, image_url, created_at"
)


def _get_predictions_for_export(user_id: str) -> list[dict[str, Any]]:
    """All the caller's stored predictions, whitelisted columns only (no
    image_hash or other internal fields). Empty list on any DB miss so the
    download still succeeds for a user whose history table is unavailable."""
    try:
        client = get_supabase_client()
        rows: list[dict[str, Any]] = []
        offset = 0
        page = 500
        while True:
            resp = (
                client.table("predictions")
                .select(_PREDICTION_EXPORT_COLUMNS)
                .eq("user_id", user_id)
                .order("created_at", desc=True)
                .range(offset, offset + page - 1)
                .execute()
            )
            batch = resp.data or []
            rows.extend(batch)
            if len(batch) < page:
                break
            offset += page
        return rows
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("prediction export fetch degraded for user=%s: %s", user_id, exc)
        return []


@router.get("/me/export", status_code=status.HTTP_200_OK,
            summary="Download all account data as JSON")
async def export_account_data(
    claims: dict[str, Any] = Depends(get_current_user_claims),
) -> dict[str, Any]:
    """Return the caller's own profile, settings and full prediction history as
    a single JSON document (data-portability). Strictly scoped to the JWT sub;
    no other user's data and no internal credential columns are included."""
    user_id = str(claims["sub"])
    profile = _build_profile_response(user_id, claims, _get_profile_row(user_id)).model_dump()
    settings_obj = _build_settings_response(_get_settings_row(user_id)).model_dump()
    return {
        "exported_at": _now(),
        "profile": profile,
        "settings": settings_obj,
        "predictions": _get_predictions_for_export(user_id),
    }


# ── POST /api/v1/users/me/sign-out-all ───────────────────────────────────────

@router.post("/me/sign-out-all", status_code=status.HTTP_200_OK,
             summary="End every signed-in session")
async def sign_out_everywhere(
    user_id: str = Depends(get_current_user_id),
) -> dict[str, str]:
    """Invalidate every token issued for this user BEFORE now.

    Stamps password_changed_at; FastAPI (core/auth.py) and the auth service
    (auth.middleware.js) then reject any token whose iat is older than the
    stamp. The caller's own current token is invalidated too, so the client
    clears its session and signs back in — that is the honest, real version of
    "sign out everywhere" that a stateless JWT setup can offer.
    """
    _stamp_password_changed(user_id)
    return {"message": "All other sessions have been ended. Please sign in again."}


# ── POST /api/v1/users/me/change-email ───────────────────────────────────────

_EMAIL_RE = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")


@router.post("/me/change-email", status_code=status.HTTP_200_OK,
             summary="Change the sign-in email address")
async def change_email(
    body: ChangeEmailRequest,
    claims: dict[str, Any] = Depends(get_current_user_claims),
) -> dict[str, str]:
    """Change the account's sign-in email via the auth service's internal
    endpoint. The auth service re-verifies the CURRENT password and confirms
    the new address is free before applying it (email_confirm=True, since the
    owner proved possession of the account by supplying the password). All
    sessions are invalidated afterwards so the new email takes effect."""
    new_email = (body.new_email or "").strip().lower()
    if not _EMAIL_RE.fullmatch(new_email):
        raise HTTPException(status_code=422, detail="Enter a valid email address.")
    user_id = str(claims["sub"])
    resp_status, data = await _post_internal(
        "/api/internal/change-email",
        {
            "user_id": user_id,
            "current_password": body.current_password,
            "new_email": new_email,
        },
        not_configured="Email change unavailable: auth service not configured.",
    )
    if resp_status != 200:
        raise _user_error(resp_status, data, "Email change failed.")
    _stamp_password_changed(user_id)
    return {"message": "Email updated. Please sign in again with your new email."}


# ── POST /api/v1/users/me/delete-account ─────────────────────────────────────

# App tables keyed by user_id that hold this user's data. Each is deleted
# independently and best-effort — one missing/renamed table must never leave
# the rest of the account's data orphaned behind a hard-failing request.
_PURGE_TABLES = (
    "predictions", "calendar_reminders", "notifications",
    "notification_preferences", "email_alert_log", "user_activity",
    "support_queries", "feedback", "feedback_messages", "feedback_notes",
    "user_settings",
)


def _purge_user_data(user_id: str) -> dict[str, int]:
    """Delete every app row and stored file the account owns. Returns a small
    per-target count summary for the log. Called only after the auth user has
    already been removed, so this is cleanup of now-ownerless data."""
    client = get_supabase_client()
    counts: dict[str, int] = {}

    # Prediction images first — their URLs disappear with the rows.
    try:
        rows = (
            client.table("predictions")
            .select("image_url")
            .eq("user_id", user_id)
            .execute()
            .data or []
        )
        imgs = 0
        for r in rows:
            url = r.get("image_url")
            if isinstance(url, str) and url.startswith("http"):
                if delete_file_from_storage(url):
                    imgs += 1
        counts["prediction_images"] = imgs
    except Exception as exc:
        logger.warning("purge: prediction image sweep failed for %s: %s", user_id, exc)

    for table in _PURGE_TABLES:
        try:
            resp = client.table(table).delete().eq("user_id", user_id).execute()
            counts[table] = len(resp.data or [])
        except Exception as exc:
            logger.warning("purge: could not delete %s rows for %s: %s", table, user_id, exc)

    # Avatar files live in their own bucket under {user_id}/.
    try:
        listed = client.storage.from_(_AVATAR_BUCKET).list(str(user_id))
        paths = [
            f"{user_id}/{f['name']}"
            for f in (listed or [])
            if isinstance(f, dict) and f.get("name")
        ]
        if paths:
            client.storage.from_(_AVATAR_BUCKET).remove(paths)
        counts["avatars"] = len(paths)
    except Exception as exc:
        logger.warning("purge: avatar cleanup skipped for %s: %s", user_id, exc)

    try:
        client.table("profiles").delete().eq("id", user_id).execute()
        counts["profiles"] = 1
    except Exception as exc:
        logger.warning("purge: could not delete profile for %s: %s", user_id, exc)

    return counts


@router.post("/me/delete-account", status_code=status.HTTP_200_OK,
             summary="Permanently delete this account and all its data")
async def delete_account(
    body: DeleteAccountRequest,
    claims: dict[str, Any] = Depends(get_current_user_claims),
) -> dict[str, str]:
    """Self-service account deletion.

    Identity is proven twice: FastAPI has already verified the caller's JWT, and
    the auth service re-checks the CURRENT password before it removes the
    Supabase Auth user. Only once the credentials are gone do we cascade-delete
    the app's rows and storage files. Irreversible by design."""
    user_id = str(claims["sub"])
    resp_status, data = await _post_internal(
        "/api/internal/delete-account",
        {"user_id": user_id, "password": body.password},
        not_configured="Account deletion unavailable: auth service not configured.",
    )
    if resp_status != 200:
        raise _user_error(resp_status, data, "Account deletion failed.")
    counts = _purge_user_data(user_id)
    logger.info("deleted account + data for user=%s counts=%s", user_id, counts)
    return {"message": "Your account and all associated data have been permanently deleted."}


# ── Two-factor authentication (TOTP) ─────────────────────────────────────────

def _write_settings_columns(user_id: str, fields: dict[str, Any]) -> None:
    """Best-effort partial upsert of a few scalar user_settings columns. Used
    only by the 2FA flow (the secret / flag are written here, never through the
    general settings PATCH, so a browser can't set two_factor_enabled directly)."""
    client = get_supabase_client()
    payload = {"user_id": user_id, **fields, "updated_at": _now()}
    client.table(_SETTINGS_TABLE).upsert(payload, on_conflict="user_id").execute()


@router.post("/me/2fa/setup", status_code=status.HTTP_200_OK,
             summary="Begin two-factor enrolment (generate a TOTP secret)")
async def two_factor_setup(
    claims: dict[str, Any] = Depends(get_current_user_claims),
) -> dict[str, Any]:
    """Create a fresh TOTP secret for the caller and return it plus its
    otpauth:// URI. 2FA is NOT yet enabled — the user must confirm with a code
    via /me/2fa/enable, so a half-finished enrolment never locks anyone out.
    The secret is returned ONCE here (the enrolment step) and is never exposed
    by any GET/export afterwards."""
    user_id = str(claims["sub"])
    secret = generate_secret()
    _write_settings_columns(user_id, {"totp_secret": secret, "two_factor_enabled": False})
    email = str(claims.get("email") or "")
    return {
        "secret": secret,
        "otpauth_uri": otpauth_uri(secret, email),
        "enabled": False,
        "message": "Scan the QR code (or enter the key) in your authenticator app, then confirm the code.",
    }


@router.post("/me/2fa/enable", status_code=status.HTTP_200_OK,
             summary="Confirm and turn on two-factor authentication")
async def two_factor_enable(
    body: TwoFactorCodeRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """Verify the supplied code against the pending secret and, on success,
    flip two_factor_enabled on. From the next sign-in the auth service will
    challenge for a code (see auth.controller.js:login)."""
    row = _get_settings_row(user_id)
    secret = row.get("totp_secret")
    if not secret:
        raise HTTPException(
            status_code=400,
            detail="Start two-factor setup first to get a code to confirm.",
        )
    if not verify_totp(str(secret), body.code):
        raise HTTPException(status_code=401, detail="That code didn't match. Check your app and try again.")
    _write_settings_columns(user_id, {"two_factor_enabled": True})
    return {"enabled": True, "message": "Two-factor authentication is on."}


@router.post("/me/2fa/disable", status_code=status.HTTP_200_OK,
             summary="Turn off two-factor authentication")
async def two_factor_disable(
    body: TwoFactorCodeRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """Require a valid current code before removing 2FA, so a hijacked session
    can't silently downgrade the account's security. Clears the secret too."""
    row = _get_settings_row(user_id)
    secret = row.get("totp_secret")
    if secret and not verify_totp(str(secret), body.code):
        raise HTTPException(status_code=401, detail="That code didn't match. Two-factor stays on.")
    _write_settings_columns(user_id, {"two_factor_enabled": False, "totp_secret": None})
    return {"enabled": False, "message": "Two-factor authentication is off."}


# ── GET /api/v1/users/me/sessions — recent sign-in activity ──────────────────

@router.get("/me/sessions", status_code=status.HTTP_200_OK,
            summary="Recent sign-in activity for this account")
async def recent_sessions(
    user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    """List the account's most recent logins (device + time), read from the
    user_activity table the auth service already writes on every sign-in. This
    is the honest, real version of an 'active sessions' view for a stateless-
    JWT app: it shows WHERE and WHEN the account signed in, and the 'sign out
    everywhere' action (which invalidates all older tokens) sits beside it.
    Degrades to an empty list if activity tracking isn't set up yet."""
    try:
        client = get_supabase_client()
        rows = (
            client.table("user_activity")
            .select("created_at,metadata")
            .eq("user_id", user_id)
            .eq("event_type", "user_login")
            .order("created_at", desc=True)
            .limit(10)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        logger.warning("sessions read degraded for user=%s: %s", user_id, exc)
        rows = []

    sessions = []
    for r in rows:
        meta = r.get("metadata") or {}
        if not isinstance(meta, dict):
            meta = {}
        sessions.append({
            "when": r.get("created_at"),
            "device": meta.get("device") or "Unknown device",
            "method": meta.get("method") or "",
            "ip": meta.get("ip") or "",
        })
    return {"sessions": sessions, "total": len(sessions)}
