"""
WheatGuard AI – Disease Weather Risk Configuration Store

Admin-managed rules that drive the backend scoring engine:
  * disease_weather_profiles  – one row per ML disease class
  * disease_weather_factors   – per-disease factor weights + favorable ranges
  * weather_risk_thresholds   – global score → risk-level mapping
  * weather_risk_logs         – best-effort snapshot trail (never fatal)

Mirrors the admin_crud conventions: Supabase tables when available, in-memory
fallback so the panel works before schema_weather_risk.sql is applied, and
auto-seeding from the model's own class_names.json so new ML classes appear
in the admin list without a code change.

Seeded ranges are transcribed from the project knowledge base
(app/ml/disease_info.json "favourable_conditions" + the assistant KB) —
they are configurable application defaults, NOT scientific guarantees.
"""

from __future__ import annotations

import json
import time
import uuid
from datetime import datetime, timezone
from typing import Any

from app.core.config import settings
from app.core.logging import get_logger
from app.database.database import get_supabase_client

logger = get_logger(__name__)

_PROFILES_TABLE = "disease_weather_profiles"
_FACTORS_TABLE = "disease_weather_factors"
_THRESHOLDS_TABLE = "weather_risk_thresholds"
_LOGS_TABLE = "weather_risk_logs"

# Factors the scoring engine understands. Anything else saved by an admin is
# ignored at calculation time (kept stored so the rule survives an engine
# upgrade). leaf_wetness has no Open-Meteo source → always "unavailable".
FACTOR_KEYS: tuple[str, ...] = (
    "temperature", "humidity", "rainfall", "wind", "dew_point", "leaf_wetness",
)

FACTOR_LABELS: dict[str, str] = {
    "temperature": "Temperature",
    "humidity": "Relative Humidity",
    "rainfall": "Rainfall",
    "wind": "Wind Speed",
    "dew_point": "Dew Point",
    "leaf_wetness": "Leaf Wetness",
}

FACTOR_UNITS: dict[str, str] = {
    "temperature": "°C",
    "humidity": "%",
    "rainfall": "mm",
    "wind": "km/h",
    "dew_point": "°C",
    "leaf_wetness": "h",
}

DEFAULT_WEIGHTS: dict[str, int] = {
    "temperature": 30,
    "humidity": 30,
    "rainfall": 20,
    "wind": 10,
    "dew_point": 10,
}

DEFAULT_THRESHOLDS: list[dict[str, Any]] = [
    {"level_name": "Very Low", "min_score": 0, "max_score": 19, "display_order": 1},
    {"level_name": "Low", "min_score": 20, "max_score": 39, "display_order": 2},
    {"level_name": "Moderate", "min_score": 40, "max_score": 59, "display_order": 3},
    {"level_name": "High", "min_score": 60, "max_score": 79, "display_order": 4},
    {"level_name": "Very High", "min_score": 80, "max_score": 100, "display_order": 5},
]

# Favorable ranges transcribed from the project KB (disease_info.json
# favourable_conditions / assistant KB). Keyed by lower-cased ML class name.
# "temp" = °C, "hum" = %RH, "rain" = mm/24h, "wind" = km/h, "dew" = °C.
_KB_DEFAULTS: dict[str, dict[str, tuple[float, float] | None]] = {
    "yellow rust":  {"temp": (7.0, 15.0),  "hum": (70.0, 100.0), "rain": (3.0, 40.0), "wind": (0.0, 35.0), "dew": (8.0, 18.0)},
    "stripe rust":  {"temp": (7.0, 15.0),  "hum": (70.0, 100.0), "rain": (3.0, 40.0), "wind": (0.0, 35.0), "dew": (8.0, 18.0)},
    "brown rust":   {"temp": (15.0, 22.0), "hum": (60.0, 100.0), "rain": (3.0, 40.0), "wind": (0.0, 35.0), "dew": (10.0, 20.0)},
    "leaf rust":    {"temp": (15.0, 22.0), "hum": (60.0, 100.0), "rain": (3.0, 40.0), "wind": (0.0, 35.0), "dew": (10.0, 20.0)},
    "stem rust":    {"temp": (18.0, 30.0), "hum": (60.0, 100.0), "rain": (3.0, 40.0), "wind": (0.0, 40.0), "dew": (12.0, 22.0)},
    "powdery mildew": {"temp": (15.0, 22.0), "hum": (50.0, 75.0), "rain": (0.0, 15.0), "wind": (0.0, 30.0), "dew": (8.0, 16.0)},
    "septoria leaf blotch": {"temp": (10.0, 25.0), "hum": (75.0, 100.0), "rain": (5.0, 60.0), "wind": (0.0, 40.0), "dew": (12.0, 20.0)},
    "septoria": {"temp": (10.0, 25.0), "hum": (75.0, 100.0), "rain": (5.0, 60.0), "wind": (0.0, 40.0), "dew": (12.0, 20.0)},
    "fusarium head blight": {"temp": (25.0, 30.0), "hum": (70.0, 100.0), "rain": (5.0, 50.0), "wind": (0.0, 35.0), "dew": (15.0, 24.0)},
    "tan spot": {"temp": (20.0, 28.0), "hum": (60.0, 95.0), "rain": (2.0, 40.0), "wind": (0.0, 35.0), "dew": (12.0, 22.0)},
}

_range_note = "Range from the WheatGuard knowledge base — adjustable by admins."

_TABLE_OK: dict[str, bool] = {}
_MEM_PROFILES: list[dict[str, Any]] = []
_MEM_THRESHOLDS: list[dict[str, Any]] = []
_SEEDED = False

# Admin-config reads hit Supabase over the network on every /weather/risk call,
# which dominated steady-state latency. These rules change rarely (only through
# the admin panel), so we cache the assembled payloads briefly and invalidate
# the cache on every write. The short TTL is only a safety net for multi-
#instance deployments; single-instance edits are picked up immediately.
_CONFIG_CACHE_SECONDS = 120.0
_PROFILES_CACHE: tuple[float, list[dict[str, Any]]] | None = None
_THRESHOLDS_CACHE: tuple[float, list[dict[str, Any]]] | None = None


def _invalidate_config_cache() -> None:
    global _PROFILES_CACHE, _THRESHOLDS_CACHE
    _PROFILES_CACHE = None
    _THRESHOLDS_CACHE = None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _client():
    return get_supabase_client()


def _table_ok(name: str) -> bool:
    if name in _TABLE_OK:
        return _TABLE_OK[name]
    try:
        _client().table(name).select("*").limit(1).execute()
        _TABLE_OK[name] = True
    except Exception:
        _TABLE_OK[name] = False
        logger.warning("Weather table '%s' unavailable – using in-memory store", name)
    return _TABLE_OK[name]


def _slug(value: str) -> str:
    return "".join(c.lower() if c.isalnum() else "-" for c in value).strip("-")


def model_classes() -> list[str]:
    """Disease classes discovered from the trained model (single source of
    truth — admin list auto-includes any new class)."""
    try:
        raw = json.loads(settings.class_names_path.read_text(encoding="utf-8"))
        return [str(c) for c in raw if c]
    except Exception as exc:
        logger.error("Could not read class_names.json: %s", exc)
        return ["Healthy", "Yellow Rust", "Brown Rust", "Stem rust", "Powdery Mildew"]


def _display_name(cls: str) -> str:
    return cls.replace("_", " ").strip().title()


def _default_factors(cls: str) -> list[dict[str, Any]]:
    kb = _KB_DEFAULTS.get(cls.lower().strip())
    if not kb:
        return []
    keys = {"temp": "temperature", "hum": "humidity", "rain": "rainfall", "wind": "wind", "dew": "dew_point"}
    factors: list[dict[str, Any]] = []
    for short, factor_key in keys.items():
        rng = kb.get(short)
        if not rng:
            continue
        factors.append({
            "factor_key": factor_key,
            "weight": DEFAULT_WEIGHTS[factor_key],
            "min_value": rng[0],
            "max_value": rng[1],
            "unit": FACTOR_UNITS[factor_key],
            "explanation": _range_note,
            "active": True,
        })
    return factors


def _new_profile(cls: str, order: int) -> dict[str, Any]:
    healthy = "healthy" in cls.lower()
    return {
        "id": str(uuid.uuid4()),
        "disease_key": cls,
        "display_name": _display_name(cls),
        "slug": _slug(cls),
        "description": (
            "Healthy crops are excluded from weather-risk scoring."
            if healthy else ""
        ),
        "scientific_name": "",
        "active": not healthy,
        "display_order": order,
        "factors": [] if healthy else _default_factors(cls),
        "created_at": _now(),
        "updated_at": _now(),
    }


# ── Seeding ───────────────────────────────────────────────────────────────────

def _ensure_seeded() -> None:
    """Seed profiles + thresholds once: push into Supabase when the tables
    exist and are empty, always keep the in-memory store primed as fallback."""
    global _SEEDED
    if _SEEDED:
        return
    _SEEDED = True

    classes = model_classes()
    _MEM_PROFILES.clear()
    _MEM_PROFILES.extend(_new_profile(c, i) for i, c in enumerate(classes))
    _MEM_THRESHOLDS.clear()
    _MEM_THRESHOLDS.extend(
        {**t, "id": str(uuid.uuid4()), "created_at": _now(), "updated_at": _now()}
        for t in DEFAULT_THRESHOLDS
    )

    if _table_ok(_PROFILES_TABLE):
        try:
            existing = _client().table(_PROFILES_TABLE).select("disease_key").execute()
            have = {r.get("disease_key") for r in (existing.data or [])}
            for profile in _MEM_PROFILES:
                if profile["disease_key"] in have:
                    continue
                factors = profile["factors"]
                row = {k: v for k, v in profile.items() if k != "factors"}
                inserted = _client().table(_PROFILES_TABLE).insert(row).execute()
                data = inserted.data or []
                if data and factors:
                    pid = data[0].get("id")
                    _client().table(_FACTORS_TABLE).insert(
                        [{**f, "profile_id": pid} for f in factors]
                    ).execute()
        except Exception as exc:
            logger.warning("Weather profile seeding failed: %s", exc)

    if _table_ok(_THRESHOLDS_TABLE):
        try:
            existing = _client().table(_THRESHOLDS_TABLE).select("level_name").execute()
            have = {r.get("level_name") for r in (existing.data or [])}
            missing = [t for t in DEFAULT_THRESHOLDS if t["level_name"] not in have]
            if missing:
                _client().table(_THRESHOLDS_TABLE).insert(missing).execute()
        except Exception as exc:
            logger.warning("Weather threshold seeding failed: %s", exc)


# ── Profiles ──────────────────────────────────────────────────────────────────

def list_profiles() -> list[dict[str, Any]]:
    """All profiles with their factors, ordered as configured (cached)."""
    global _PROFILES_CACHE
    now = time.time()
    if _PROFILES_CACHE is not None and (now - _PROFILES_CACHE[0]) < _CONFIG_CACHE_SECONDS:
        return [dict(p, factors=[dict(f) for f in p.get("factors", [])]) for p in _PROFILES_CACHE[1]]
    loaded = _load_profiles()
    _PROFILES_CACHE = (now, loaded)
    return [dict(p, factors=[dict(f) for f in p.get("factors", [])]) for p in loaded]


def _load_profiles() -> list[dict[str, Any]]:
    """Uncached profile read (Supabase when available, else in-memory)."""
    _ensure_seeded()
    if _table_ok(_PROFILES_TABLE):
        try:
            rows = _client().table(_PROFILES_TABLE).select("*").order("display_order").execute().data or []
            factor_rows: list[dict[str, Any]] = []
            if _table_ok(_FACTORS_TABLE) and rows:
                ids = ",".join(str(r["id"]) for r in rows)
                factor_rows = (
                    _client().table(_FACTORS_TABLE)
                    .select("*")
                    .filter("profile_id", "in", f"({ids})")
                    .execute().data or []
                )
            by_profile: dict[str, list[dict[str, Any]]] = {}
            for f in factor_rows:
                by_profile.setdefault(str(f["profile_id"]), []).append(f)
            out = []
            for r in rows:
                merged = _merge_stored_defaults(dict(r))
                merged["factors"] = sorted(by_profile.get(str(r["id"]), []), key=lambda f: str(f.get("factor_key")))
                out.append(merged)
            if out:
                # New ML classes appear in the admin list automatically —
                # any class without a stored profile is surfaced with its
                # default (unsaved) configuration.
                have = {str(p.get("disease_key", "")).lower() for p in out}
                for i, cls in enumerate(model_classes()):
                    if cls.lower() not in have:
                        virtual = _new_profile(cls, (len(out) + i))
                        virtual["unsaved"] = True
                        out.append(virtual)
                return out
        except Exception as exc:
            logger.warning("list_profiles DB read failed: %s", exc)
    return [dict(p, factors=[dict(f) for f in p["factors"]]) for p in _MEM_PROFILES]


def _merge_stored_defaults(row: dict[str, Any]) -> dict[str, Any]:
    """Fill fields the DB row may lack (old schema, partial writes)."""
    key = str(row.get("disease_key") or "")
    row.setdefault("display_name", _display_name(key))
    row.setdefault("slug", _slug(key))
    row.setdefault("description", "")
    row.setdefault("scientific_name", "")
    row.setdefault("active", True)
    row.setdefault("display_order", 0)
    row["disease_key"] = key
    return row


def get_profile(disease_key: str) -> dict[str, Any] | None:
    for p in list_profiles():
        if str(p.get("disease_key", "")).lower() == disease_key.lower():
            return p
    return None


def upsert_profile(disease_key: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Create or replace a profile and its factor set (admin save)."""
    _ensure_seeded()
    _invalidate_config_cache()
    factors = _normalise_factors(payload.get("factors") or [])
    base = {
        "disease_key": disease_key,
        "display_name": str(payload.get("display_name") or _display_name(disease_key)),
        "slug": _slug(str(payload.get("slug") or disease_key)),
        "description": str(payload.get("description") or ""),
        "scientific_name": str(payload.get("scientific_name") or ""),
        "active": bool(payload.get("active", True)),
        "display_order": int(payload.get("display_order") or 0),
        "updated_at": _now(),
    }

    if _table_ok(_PROFILES_TABLE):
        try:
            existing = (
                _client().table(_PROFILES_TABLE).select("*")
                .eq("disease_key", disease_key).maybe_single().execute()
            )
            row = existing.data if existing else None
            if row:
                pid = str(row["id"])
                upd = {k: v for k, v in base.items() if k != "disease_key"}
                _client().table(_PROFILES_TABLE).update(upd).eq("id", pid).execute()
            else:
                inserted = _client().table(_PROFILES_TABLE).insert(base).execute()
                pid = str((inserted.data or [{}])[0].get("id") or uuid.uuid4())
            if _table_ok(_FACTORS_TABLE):
                _client().table(_FACTORS_TABLE).delete().eq("profile_id", pid).execute()
                if factors:
                    _client().table(_FACTORS_TABLE).insert(
                        [{**f, "profile_id": pid} for f in factors]
                    ).execute()
            saved = {**base, "id": pid, "factors": factors, "created_at": row.get("created_at") if row else _now()}
            _mem_replace(saved)
            return saved
        except Exception as exc:
            logger.error("upsert_profile DB write failed (%s): falling back to memory", disease_key, exc)

    saved = {
        **base,
        "id": next((p["id"] for p in _MEM_PROFILES if p["disease_key"] == disease_key), str(uuid.uuid4())),
        "factors": factors,
        "created_at": _now(),
    }
    _mem_replace(saved)
    return saved


def _mem_replace(profile: dict[str, Any]) -> None:
    global _MEM_PROFILES
    _MEM_PROFILES = [p for p in _MEM_PROFILES if p["disease_key"] != profile["disease_key"]]
    _MEM_PROFILES.append(profile)
    _MEM_PROFILES.sort(key=lambda p: (p.get("display_order") or 0, str(p.get("disease_key"))))


def _normalise_factors(raw: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in raw:
        key = str(item.get("factor_key") or "").strip()
        if key not in FACTOR_KEYS or key in seen:
            continue
        seen.add(key)
        weight = item.get("weight")
        try:
            weight = max(0, min(100, int(weight)))
        except (TypeError, ValueError):
            weight = DEFAULT_WEIGHTS.get(key, 10)

        def _num(value: Any) -> float | None:
            if value is None or value == "":
                return None
            try:
                return float(value)
            except (TypeError, ValueError):
                return None

        mn, mx = _num(item.get("min_value")), _num(item.get("max_value"))
        if mn is not None and mx is not None and mn > mx:
            mn, mx = mx, mn
        out.append({
            "factor_key": key,
            "weight": weight,
            "min_value": mn,
            "max_value": mx,
            "unit": str(item.get("unit") or FACTOR_UNITS.get(key, "")),
            "explanation": str(item.get("explanation") or ""),
            "active": bool(item.get("active", True)),
        })
    return out


# ── Thresholds ────────────────────────────────────────────────────────────────

def list_thresholds() -> list[dict[str, Any]]:
    global _THRESHOLDS_CACHE
    now = time.time()
    if _THRESHOLDS_CACHE is not None and (now - _THRESHOLDS_CACHE[0]) < _CONFIG_CACHE_SECONDS:
        return [dict(t) for t in _THRESHOLDS_CACHE[1]]
    rows = _load_thresholds()
    _THRESHOLDS_CACHE = (now, rows)
    return [dict(t) for t in rows]


def _load_thresholds() -> list[dict[str, Any]]:
    _ensure_seeded()
    if _table_ok(_THRESHOLDS_TABLE):
        try:
            rows = (
                _client().table(_THRESHOLDS_TABLE).select("*")
                .order("display_order").execute().data or []
            )
            if rows:
                return rows
        except Exception as exc:
            logger.warning("list_thresholds DB read failed: %s", exc)
    return [dict(t) for t in _MEM_THRESHOLDS]


def save_thresholds(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Replace the full threshold set (validated: 0–100, ordered, no overlap
    enforced at calculation time by first-match order)."""
    _ensure_seeded()
    _invalidate_config_cache()
    cleaned: list[dict[str, Any]] = []
    for idx, item in enumerate(rows):
        name = str(item.get("level_name") or "").strip()
        if not name:
            continue
        def _score(value: Any, default: int) -> int:
            try:
                return max(0, min(100, int(value)))
            except (TypeError, ValueError):
                return default
        mn = _score(item.get("min_score"), 0)
        mx = _score(item.get("max_score"), 0)
        if mn > mx:
            mn, mx = mx, mn
        cleaned.append({
            "level_name": name,
            "min_score": mn,
            "max_score": mx,
            "display_order": int(item.get("display_order") or idx + 1),
            "updated_at": _now(),
        })
    if not cleaned:
        raise ValueError("At least one risk level is required.")

    global _MEM_THRESHOLDS
    _MEM_THRESHOLDS = [{**c, "id": str(uuid.uuid4()), "created_at": _now()} for c in cleaned]

    if _table_ok(_THRESHOLDS_TABLE):
        try:
            _client().table(_THRESHOLDS_TABLE).delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
            _client().table(_THRESHOLDS_TABLE).insert(cleaned).execute()
        except Exception as exc:
            logger.error("save_thresholds DB write failed: %s", exc)
    return [dict(t) for t in _MEM_THRESHOLDS]


# ── Score log (best-effort analytics, never fatal) ───────────────────────────

def log_risk(user_id: str | None, location: str, entries: list[dict[str, Any]]) -> None:
    if not _table_ok(_LOGS_TABLE) or not entries:
        return
    try:
        _client().table(_LOGS_TABLE).insert([
            {
                "user_id": user_id,
                "location": location[:200],
                "disease_key": str(e.get("disease_key") or ""),
                "risk_score": int(e.get("score") or 0),
                "risk_level": str(e.get("level") or ""),
                "factors": e.get("factors") or [],
            }
            for e in entries
        ]).execute()
    except Exception as exc:
        logger.debug("weather_risk_logs insert skipped: %s", exc)
