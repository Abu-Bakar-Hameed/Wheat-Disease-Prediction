"""
WheatGuard AI – Disease Alert Service
Decides whether a finished prediction deserves a Gmail disease alert and, if so,
asks the auth backend (which owns the SMTP credentials) to deliver it.

Central trigger rule — the single source of truth for the whole product:

    severity (or, failing that, risk level) normalised to HIGH or CRITICAL → alert
    anything else (none / low / moderate / unknown, i.e. Healthy)          → no alert

The auth backend performs the actual send; this module only hands over data that
was produced or verified server-side. Recipient addresses come from the
`profiles` table or the verified JWT claims, never from the request body, so a
client cannot point an alert at somebody else's mailbox.

Duplicate protection lives in the auth backend's `email_alert_log`: a row with
status='sent' for this prediction_id short-circuits a re-send, while a
status='failed' row does not — so a genuine delivery failure stays retryable.

Every failure mode here is non-fatal by design (§10): a prediction that has
already succeeded and been saved must never turn into an error because email
delivery did not work.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

from app.core.config import settings
from app.core.logging import get_logger
from app.database.database import get_supabase_client

logger = get_logger(__name__)

# Only these two buckets ever produce an email.
ALERT_SEVERITIES = frozenset({"high", "critical"})

# prediction.py uses this placeholder when the DB write failed.
_UNSAVED_PREDICTION_ID = "unavailable"

_SETTINGS_TABLE = "user_settings"
_PROFILES_TABLE = "profiles"


@dataclass(frozen=True)
class AlertOutcome:
    """Result of the alert decision plus the delivery handoff.

    queued – the auth backend accepted the alert (all guards passed, send started)
    sent   – the auth backend confirmed Gmail accepted the message

    Both stay False when no alert was warranted, so the caller can tell
    "not applicable" apart from "attempted and failed".
    """

    queued: bool = False
    sent: bool = False
    reason: str = ""


def _mask_email(address: str) -> str:
    """`farmer@example.com` → `fa***@example.com` for log lines."""
    local, _, domain = address.partition("@")
    if not domain:
        return "***"
    keep = local[:2] if len(local) > 2 else local[:1]
    return f"{keep}***@{domain}"


def alert_bucket(*values: str | None) -> str | None:
    """Normalise severity / risk wording to 'high' | 'critical', else None.

    Case- and whitespace-insensitive: HIGH, High, high and ' critical ' all
    behave identically. The first argument wins, so the caller passes severity
    first and the risk level as the fallback.
    """
    for value in values:
        token = str(value or "").strip().lower()
        if token in ALERT_SEVERITIES:
            return token
    return None


def user_wants_email_alerts(user_id: str) -> bool:
    """Read `user_settings.email_high_severity_alerts` (default: enabled).

    Fails open on a settings read error: suppressing a critical disease warning
    because a preference row could not be fetched would be the worse mistake.
    """
    try:
        client = get_supabase_client()
        row = (
            client.table(_SETTINGS_TABLE)
            .select("email_high_severity_alerts")
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
            .data
            or {}
        )
        value = row.get("email_high_severity_alerts")
        return value if isinstance(value, bool) else True
    except Exception as exc:
        logger.warning("Could not read email alert preference for user=%s: %s", user_id, exc)
        return True


def resolve_recipient(
    user_id: str, claims: dict[str, Any] | None = None
) -> tuple[str, str]:
    """Return (email, display_name) for the authenticated user.

    Trusted order: the `profiles` row (authoritative — it follows an address
    change) then the signature-verified JWT claims. The request body is never
    consulted.
    """
    claims = claims or {}
    email = ""
    name = str(claims.get("name") or "").strip()
    try:
        client = get_supabase_client()
        row = (
            client.table(_PROFILES_TABLE)
            .select("email,name")
            .eq("id", user_id)
            .maybe_single()
            .execute()
            .data
            or {}
        )
        email = str(row.get("email") or "").strip()
        name = str(row.get("name") or name).strip()
    except Exception as exc:
        logger.warning("Could not read profile email for user=%s: %s", user_id, exc)

    if not email:
        email = str(claims.get("email") or "").strip()
    return email, name


async def trigger_disease_alert(
    *,
    user_id: str,
    user_email: str,
    user_name: str = "",
    prediction_id: str,
    disease_name: str,
    confidence_pct: float,
    severity: str,
    risk_level: str,
    recommendation: str = "",
    image_url: str | None = None,
) -> AlertOutcome:
    """POST to the auth backend's /api/internal/disease-alert endpoint.

    Never raises: any transport or upstream error becomes an AlertOutcome with
    queued/sent False and a machine-readable `reason`, so the caller can log it
    without exposing SMTP detail to the user.
    """
    if not settings.internal_api_secret:
        logger.warning(
            "INTERNAL_API_SECRET not set — disease alert skipped for prediction %s",
            prediction_id,
        )
        return AlertOutcome(reason="internal_secret_not_configured")

    url = f"{settings.auth_backend_url.rstrip('/')}/api/internal/disease-alert"

    payload: dict[str, Any] = {
        "user_id": user_id,
        "user_email": user_email,
        "user_name": user_name,
        "prediction_id": prediction_id,
        "disease_name": disease_name,
        "confidence_pct": confidence_pct,
        "severity": severity,
        "risk_level": risk_level,
        "recommendation": recommendation,
        "image_url": image_url,
    }

    try:
        async with httpx.AsyncClient(
            timeout=settings.email_alert_timeout_seconds
        ) as client:
            resp = await client.post(
                url,
                json=payload,
                headers={"x-internal-secret": settings.internal_api_secret},
            )
    except httpx.TimeoutException as exc:
        # Expected slow path: the auth service only answers once Gmail has
        # accepted the message, so a cold TLS handshake can outlive the budget.
        # The send may still complete upstream — the duplicate guard in
        # `email_alert_log` makes that harmless, and we report "not sent".
        logger.error(
            "Disease alert email timed out after %.1fs | prediction=%s risk=%s error=%s: %s",
            settings.email_alert_timeout_seconds,
            prediction_id,
            severity,
            type(exc).__name__,
            exc or "no message",
        )
        return AlertOutcome(reason="auth_backend_timeout")
    except Exception as exc:
        # Only the exception type/message from our own outbound call is logged;
        # it can never contain the credentials, which live on the auth service.
        logger.error(
            "Disease alert email failed | prediction=%s risk=%s error=%s: %s",
            prediction_id,
            severity,
            type(exc).__name__,
            exc or "no message",
        )
        return AlertOutcome(reason="auth_backend_unreachable")

    if resp.status_code != 200:
        logger.error(
            "Disease alert email failed | prediction=%s risk=%s status=%d body=%s",
            prediction_id,
            severity,
            resp.status_code,
            resp.text[:200],
        )
        return AlertOutcome(reason=f"auth_backend_status_{resp.status_code}")

    data: dict[str, Any] = {}
    try:
        parsed = resp.json()
        if isinstance(parsed, dict):
            data = parsed
    except Exception:
        data = {}

    return AlertOutcome(
        queued=bool(data.get("queued")),
        sent=bool(data.get("sent")),
        reason=str(data.get("reason") or ("sent" if data.get("sent") else "not_sent")),
    )


async def maybe_send_disease_alert(
    *,
    user_id: str,
    claims: dict[str, Any] | None = None,
    prediction_id: str,
    disease_name: str,
    confidence_pct: float,
    severity: str,
    risk_level: str = "unknown",
    recommendation: str = "",
    image_url: str | None = None,
) -> AlertOutcome:
    """Gate a finished prediction on the HIGH/CRITICAL rule and, if it passes,
    deliver the email alert through the auth backend.

    Called by /api/v1/predict after the prediction row has been persisted. All
    rejections return an AlertOutcome with a `reason` and never raise.
    """
    if not settings.email_alerts_enabled:
        return AlertOutcome(reason="alerts_disabled")

    bucket = alert_bucket(severity, risk_level)
    if bucket is None:
        # Low / moderate / none / unknown — deliberately silent.
        return AlertOutcome(reason="below_threshold")

    if not prediction_id or prediction_id == _UNSAVED_PREDICTION_ID:
        # Nothing was stored, so there is no record to deep-link to and no
        # prediction_id to de-duplicate on. Skip rather than send a dead link.
        logger.warning(
            "Disease alert skipped | risk=%s but the prediction row was not saved", bucket
        )
        return AlertOutcome(reason="prediction_not_persisted")

    if not user_wants_email_alerts(user_id):
        return AlertOutcome(reason="user_disabled_email_alerts")

    recipient, user_name = resolve_recipient(user_id, claims)
    if not recipient:
        logger.warning(
            "Disease alert email skipped | user=%s prediction=%s risk=%s error=no email on file",
            user_id,
            prediction_id,
            bucket,
        )
        return AlertOutcome(reason="no_recipient")

    if settings.email_test_recipient and not settings.is_production:
        logger.info(
            "Disease alert re-routed to EMAIL_TEST_RECIPIENT (%s) in %s",
            _mask_email(settings.email_test_recipient),
            settings.app_env,
        )
        recipient = settings.email_test_recipient

    logger.info(
        "Disease alert email triggered | user=%s prediction=%s risk=%s recipient=%s",
        user_id,
        prediction_id,
        bucket.upper(),
        _mask_email(recipient),
    )

    outcome = await trigger_disease_alert(
        user_id=user_id,
        user_email=recipient,
        user_name=user_name,
        prediction_id=prediction_id,
        disease_name=disease_name,
        confidence_pct=confidence_pct,
        severity=severity,
        risk_level=risk_level,
        recommendation=recommendation,
        image_url=image_url,
    )

    if outcome.sent:
        logger.info(
            "Disease alert email status | prediction=%s risk=%s recipient=%s status=SENT",
            prediction_id,
            bucket.upper(),
            _mask_email(recipient),
        )
    elif outcome.queued:
        # Guards passed; the auth backend is still retrying in the background.
        logger.warning(
            "Disease alert email queued but not confirmed | prediction=%s reason=%s",
            prediction_id,
            outcome.reason,
        )
    else:
        logger.error(
            "Disease alert email failed | prediction=%s risk=%s error=%s",
            prediction_id,
            bucket.upper(),
            outcome.reason,
        )

    return outcome
