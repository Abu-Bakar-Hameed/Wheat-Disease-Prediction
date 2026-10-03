"""
Tests for the restructured user-settings backend (app.api.routes.users).

These exercise the pure logic that the settings GET/PATCH handlers are built
from — default application, nested-group (JSONB) parsing, navigation-path
sanitisation, and the partial + deep-merge PATCH semantics — directly, without
needing the shared `test_client` fixture. That fixture boots the whole app
(including the ML model manager), which cannot be imported in a torch-less
environment; the settings logic itself has no such dependency, so it is unit
testable in isolation.

Ownership scoping (that a caller can only ever read/write their own row) is
enforced by the `get_current_user_id` dependency + the `.eq("user_id", ...)`
filters in the helpers; it is asserted at the handler boundary by passing an
explicit user id below.
"""

from __future__ import annotations

import asyncio
from unittest.mock import patch

import pytest

from app.api.routes.users import (
    PredictionPreferences,
    UserSettingsUpdate,
    _build_settings_response,
    _parse_group,
    _sanitize_nav_path,
    update_settings,
)


# ── Fresh-user defaults ───────────────────────────────────────────────────────

def test_fresh_user_gets_safe_defaults():
    resp = _build_settings_response({})
    assert resp.units == "metric"
    assert resp.language == "en"
    assert resp.date_format == "DD/MM/YYYY"
    assert resp.time_format == "24"
    assert resp.first_day_of_week == "monday"
    assert resp.default_start_page == "/dashboard"
    assert resp.remember_last_page is False
    assert resp.show_help_tips is True
    assert resp.timezone is None
    # Every nested group is present and fully defaulted.
    assert resp.prediction_preferences.show_gradcam is True
    # open_result_auto defaults True to preserve the app's long-standing
    # "jump straight to the result" behaviour; turning it off is the opt-in.
    assert resp.prediction_preferences.open_result_auto is True
    assert resp.prediction_preferences.default_method == "standard"
    assert resp.prediction_preferences.save_auto is True
    assert resp.prediction_preferences.save_images is True
    assert resp.weather_preferences.show_on_dashboard is True
    assert resp.calendar_preferences.reminders_enabled is True
    assert resp.calendar_preferences.email is True
    assert resp.calendar_preferences.default_view == "monthly"
    assert resp.calendar_preferences.default_lead_time == "1d"
    assert resp.privacy_preferences is not None


# ── Stored-row mapping ────────────────────────────────────────────────────────

def test_stored_row_is_mapped_with_group_fill():
    row = {
        "units": "imperial",
        "timezone": "Asia/Karachi",
        "date_format": "MM/DD/YYYY",
        "remember_last_page": True,
        # A partially-populated group: the stored key wins, the rest defaults.
        "prediction_preferences": {"show_gradcam": False},
    }
    resp = _build_settings_response(row)
    assert resp.units == "imperial"
    assert resp.timezone == "Asia/Karachi"
    assert resp.date_format == "MM/DD/YYYY"
    assert resp.remember_last_page is True
    assert resp.prediction_preferences.show_gradcam is False
    assert resp.prediction_preferences.show_top is True  # filled from default


# ── Nested-group parser ───────────────────────────────────────────────────────

def test_parse_group_ignores_unknown_keys_and_fills_defaults():
    group = _parse_group({"show_top": False, "not_a_real_field": 123}, PredictionPreferences)
    assert group.show_top is False
    assert group.show_gradcam is True  # default
    assert not hasattr(group, "not_a_real_field")


@pytest.mark.parametrize("raw", [None, {}, "garbage", 42, ["list"]])
def test_parse_group_falls_back_to_defaults_on_any_bad_input(raw):
    group = _parse_group(raw, PredictionPreferences)
    assert group.show_ai_report is True


# ── Navigation-path sanitisation (stored-redirect guard) ──────────────────────

@pytest.mark.parametrize(
    "value,expected",
    [
        ("/dashboard", "/dashboard"),
        ("/dashboard/history", "/dashboard/history"),
        ("/dashboard/weather?x=1", "/dashboard/weather"),
        ("/dashboard/calendar#frag", "/dashboard/calendar"),
        ("https://evil.example", None),
        ("//evil.example", None),
        ("/etc/passwd", None),
        ("javascript:alert(1)", None),
        ("", None),
    ],
)
def test_sanitize_nav_path(value, expected):
    assert _sanitize_nav_path(value) == expected


# ── PATCH semantics (partial + deep merge) ────────────────────────────────────

def _run_patch(stored_row: dict, body: UserSettingsUpdate) -> tuple[dict, object]:
    """Call the real handler with DB access stubbed; return (saved_fields, response)."""
    with (
        patch("app.api.routes.users._get_settings_row", return_value=stored_row),
        patch("app.api.routes.users._upsert_settings_row") as upsert,
    ):
        resp = asyncio.run(update_settings(body, "user-1"))
    assert upsert.call_args[0][0] == "user-1"  # ownership: scoped to caller
    return upsert.call_args[0][1], resp


def test_partial_patch_deep_merges_group_and_preserves_others():
    stored = {
        "units": "metric",
        "prediction_preferences": {"show_gradcam": False, "show_top": False},
    }
    saved, resp = _run_patch(stored, UserSettingsUpdate(prediction_preferences={"show_gradcam": True}))

    # show_gradcam updated; show_top preserved through the deep merge.
    assert saved["prediction_preferences"]["show_gradcam"] is True
    assert saved["prediction_preferences"]["show_top"] is False
    # An unrelated flat field the client never sent is preserved.
    assert saved["units"] == "metric"
    # The response reflects the same merged state.
    assert resp.prediction_preferences.show_gradcam is True
    assert resp.prediction_preferences.show_top is False


def test_patch_updates_flat_field_only():
    saved, resp = _run_patch({"units": "metric"}, UserSettingsUpdate(units="imperial"))
    assert saved["units"] == "imperial"
    assert resp.units == "imperial"


def test_patch_rejects_external_start_page_via_sanitiser():
    saved, resp = _run_patch(
        {"default_start_page": "/dashboard"},
        UserSettingsUpdate(default_start_page="https://evil.example/phish"),
    )
    # A rejected path falls back to the safe default rather than storing it.
    assert saved["default_start_page"] == "/dashboard"
    assert resp.default_start_page == "/dashboard"


def test_patch_accepts_valid_start_page():
    _, resp = _run_patch(
        {"default_start_page": "/dashboard"},
        UserSettingsUpdate(default_start_page="/dashboard/weather"),
    )
    assert resp.default_start_page == "/dashboard/weather"
