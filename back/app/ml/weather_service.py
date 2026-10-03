"""
WheatGuard AI – Weather Risk Engine (server-side only)

Two responsibilities:

1. REAL DATA IN — Open-Meteo (keyless) current + 7-day conditions for a
   location. No weather value is ever invented: a provider failure raises
   WeatherUnavailableError and the routes answer 503 with
   "Weather data is currently unavailable." Factors Open-Meteo does not
   provide (leaf wetness) are marked unavailable and excluded from scoring.

2. RISK CALCULATION — admin-configured disease profiles decide everything:
   each factor's favorable range produces a 0–1 suitability (plateau inside
   the range, linear falloff outside), the weighted average ×100 is the
   weather risk score, and the global threshold table maps it to a level.
   The frontend performs NO risk math — it renders exactly what this module
   computes. Weather risk describes environmental favorability only; it is
   independent of the image model's confidence and never claims a disease
   will occur.
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class WeatherUnavailableError(Exception):
    """Open-Meteo could not be reached or returned unusable data."""


# ── Normalised weather model ─────────────────────────────────────────────────

@dataclass
class WeatherSnapshot:
    """Current conditions, one normalized value per scored factor."""

    temperature: float | None = None
    feels_like: float | None = None
    humidity: float | None = None
    rainfall_24h: float | None = None
    wind_speed: float | None = None
    wind_direction: str = "—"
    cloud_cover: float | None = None
    dew_point: float | None = None
    # Open-Meteo does not measure leaf wetness duration — honestly unavailable.
    leaf_wetness: float | None = None
    observed_at: str = field(default_factory=lambda: datetime.now().isoformat())

    def factor_value(self, factor_key: str) -> float | None:
        return getattr(self, factor_key, None) if factor_key != "rainfall" else self.rainfall_24h

    def as_dict(self) -> dict[str, Any]:
        return {
            "temperature": _r1(self.temperature),
            "feels_like": _r1(self.feels_like),
            "humidity": _r1(self.humidity),
            "rainfall_24h": _r1(self.rainfall_24h),
            "wind_speed": _r1(self.wind_speed),
            "wind_direction": self.wind_direction,
            "cloud_cover": _r1(self.cloud_cover),
            "dew_point": _r1(self.dew_point),
            "leaf_wetness": None,
            "leaf_wetness_available": False,
            "observed_at": self.observed_at,
        }


@dataclass
class DailyConditions:
    date: str
    day_name: str
    temp_high: float | None
    temp_low: float | None
    temp_avg: float | None
    humidity_avg: float | None
    rainfall: float | None
    wind_speed: float | None
    dew_point: float | None

    def factor_value(self, factor_key: str) -> float | None:
        return {
            "temperature": self.temp_avg,
            "humidity": self.humidity_avg,
            "rainfall": self.rainfall,
            "wind": self.wind_speed,
            "dew_point": self.dew_point,
            "leaf_wetness": None,
        }.get(factor_key)

    def as_dict(self) -> dict[str, Any]:
        return {
            "date": self.date,
            "day_name": self.day_name,
            "temp_high": _r1(self.temp_high),
            "temp_low": _r1(self.temp_low),
            "temp_avg": _r1(self.temp_avg),
            "humidity_avg": _r1(self.humidity_avg),
            "rainfall": _r1(self.rainfall),
            "wind_speed": _r1(self.wind_speed),
            "dew_point": _r1(self.dew_point),
        }


def _r1(value: float | None) -> float | None:
    return None if value is None else round(float(value), 1)


def _compass(deg: float | None) -> str:
    if deg is None:
        return "—"
    dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
            "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
    return dirs[int((float(deg) + 11.25) / 22.5) % 16]


def _num(v: Any) -> float | None:
    try:
        f = float(v)
        return None if math.isnan(f) or math.isinf(f) else f
    except (TypeError, ValueError):
        return None


# ── Open-Meteo fetch (with tiny TTL cache per coordinate) ────────────────────

_CACHE: dict[tuple[float, float], tuple[float, WeatherSnapshot, list[DailyConditions]]] = {}

# Geocoding a free-text location is a separate provider round-trip that we were
# paying on every request for signed-in users with a profile location. Results
# for a given place name are effectively static, so cache them (including the
# "no result" outcome) with the same TTL as the weather cache.
_GEO_CACHE: dict[str, tuple[float, tuple[float, float, str] | None]] = {}

_CURRENT_VARS = ",".join([
    "temperature_2m", "relative_humidity_2m", "apparent_temperature",
    "precipitation", "wind_speed_10m", "wind_direction_10m",
    "cloud_cover", "dew_point_2m",
])
_DAILY_VARS = ",".join([
    "temperature_2m_max", "temperature_2m_min", "temperature_2m_mean",
    "relative_humidity_2m_mean", "precipitation_sum",
    "wind_speed_10m_max", "dew_point_2m_mean",
])


async def fetch_weather(lat: float, lon: float) -> tuple[WeatherSnapshot, list[DailyConditions]]:
    key = (round(lat, 4), round(lon, 4))
    cached = _CACHE.get(key)
    if cached and settings.weather_cache_seconds > 0 and (time.time() - cached[0]) < settings.weather_cache_seconds:
        return cached[1], cached[2]

    params = {
        "latitude": lat,
        "longitude": lon,
        "current": _CURRENT_VARS,
        "daily": _DAILY_VARS,
        "forecast_days": 7,
        "timezone": "auto",
    }
    try:
        async with httpx.AsyncClient(timeout=settings.weather_timeout_seconds) as client:
            resp = await client.get(settings.weather_provider_base_url, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.error("Open-Meteo request failed (%s,%s): %s", lat, lon, exc)
        raise WeatherUnavailableError("Weather data is currently unavailable.") from exc

    cur = data.get("current") or {}
    daily = data.get("daily") or {}
    if not cur or cur.get("temperature_2m") is None:
        logger.error("Open-Meteo response had no usable 'current' block: %s", str(data)[:200])
        raise WeatherUnavailableError("Weather data is currently unavailable.")

    snapshot = WeatherSnapshot(
        temperature=_num(cur.get("temperature_2m")),
        feels_like=_num(cur.get("apparent_temperature")),
        humidity=_num(cur.get("relative_humidity_2m")),
        rainfall_24h=_num(cur.get("precipitation")),
        wind_speed=_num(cur.get("wind_speed_10m")),
        wind_direction=_compass(_num(cur.get("wind_direction_10m"))),
        cloud_cover=_num(cur.get("cloud_cover")),
        dew_point=_num(cur.get("dew_point_2m")),
        observed_at=str(cur.get("time") or snapshot_time_default()),
    )

    days: list[DailyConditions] = []
    # Open-Meteo returns the daily timestamp array under "time" ("date" is
    # accepted too, for safety) — the per-variable arrays are index-aligned.
    dates = daily.get("time") or daily.get("date") or []
    for i, d in enumerate(dates):
        try:
            day_name = datetime.strptime(str(d), "%Y-%m-%d").strftime("%a")
        except ValueError:
            day_name = str(d)
        days.append(DailyConditions(
            date=str(d),
            day_name=day_name,
            temp_high=_num((daily.get("temperature_2m_max") or [None] * 8)[i]),
            temp_low=_num((daily.get("temperature_2m_min") or [None] * 8)[i]),
            temp_avg=_num((daily.get("temperature_2m_mean") or [None] * 8)[i]),
            humidity_avg=_num((daily.get("relative_humidity_2m_mean") or [None] * 8)[i]),
            rainfall=_num((daily.get("precipitation_sum") or [None] * 8)[i]),
            wind_speed=_num((daily.get("wind_speed_10m_max") or [None] * 8)[i]),
            dew_point=_num((daily.get("dew_point_2m_mean") or [None] * 8)[i]),
        ))
    if not days:
        logger.error("Open-Meteo response had no usable 'daily' block: %s", str(daily)[:200])
        raise WeatherUnavailableError("Weather data is currently unavailable.")

    _CACHE[key] = (time.time(), snapshot, days)
    return snapshot, days


def snapshot_time_default() -> str:
    return datetime.now().isoformat(timespec="minutes")


async def geocode(location_text: str) -> tuple[float, float, str] | None:
    """Resolve a free-text profile location to coordinates via Open-Meteo's
    keyless geocoder. Returns (lat, lon, display_label) or None."""
    term = location_text.strip()
    if not term or len(term) > 120:
        return None
    cached = _GEO_CACHE.get(term.lower())
    ttl = settings.weather_cache_seconds
    if cached and ttl > 0 and (time.time() - cached[0]) < max(ttl, 3600):
        return cached[1]
    try:
        async with httpx.AsyncClient(timeout=settings.weather_timeout_seconds) as client:
            resp = await client.get(
                settings.weather_geocoding_url,
                params={"name": term, "count": 1, "language": "en", "format": "json"},
            )
            resp.raise_for_status()
            results = (resp.json() or {}).get("results") or []
    except Exception as exc:
        logger.warning("Geocoding failed for %r: %s", term, exc)
        return None
    if not results:
        _GEO_CACHE[term.lower()] = (time.time(), None)
        return None
    r = results[0]
    lat, lon = _num(r.get("latitude")), _num(r.get("longitude"))
    if lat is None or lon is None:
        return None
    label = ", ".join(p for p in (r.get("name"), r.get("admin1"), r.get("country_code")) if p)
    resolved = (lat, lon, label)
    _GEO_CACHE[term.lower()] = (time.time(), resolved)
    return resolved


# ── Scoring engine ───────────────────────────────────────────────────────────

_FALLOFF_FRACTION = 0.25  # range-width fraction over which suitability fades
_MIN_FALLOFF = 2.0


def suitability(value: float, min_v: float | None, max_v: float | None) -> float:
    """Plateau 1.0 inside [min,max]; linear falloff outside toward 0.

    Half-open ranges are supported: only min → favorable at/above min;
    only max → favorable at/below max (e.g. humidity ">70%").
    """
    if min_v is None and max_v is None:
        return 0.5  # no range configured → neutral contribution

    if min_v is not None and value < min_v:
        span = max_v - min_v if max_v is not None else abs(min_v) + 10.0
        falloff = max(span * _FALLOFF_FRACTION, _MIN_FALLOFF)
        return max(0.0, 1.0 - (min_v - value) / falloff)
    if max_v is not None and value > max_v:
        span = max_v - min_v if min_v is not None else abs(max_v) + 10.0
        falloff = max(span * _FALLOFF_FRACTION, _MIN_FALLOFF)
        return max(0.0, 1.0 - (value - max_v) / falloff)
    return 1.0


def impact_label(suit: float | None) -> str:
    if suit is None:
        return "Unavailable"
    if suit >= 0.75:
        return "High"
    if suit >= 0.45:
        return "Moderate"
    if suit > 0.05:
        return "Low"
    return "Very Low"


def risk_level(score: int | None, thresholds: list[dict[str, Any]]) -> str:
    if score is None:
        return "Unavailable"
    ordered = sorted(thresholds, key=lambda t: int(t.get("display_order") or 0))
    for t in ordered:
        if int(t.get("min_score", 0)) <= score <= int(t.get("max_score", 0)):
            return str(t.get("level_name"))
    # Gaps in a hand-edited table: clamp to the nearest configured band.
    best = min(ordered, key=lambda t: min(abs(score - int(t["min_score"])), abs(score - int(t["max_score"]))) if "min_score" in t and "max_score" in t else 0) if ordered else None
    return str(best.get("level_name")) if best else "Unavailable"


def score_from_factors(
    factors: list[dict[str, Any]],
    value_of: Any,
) -> tuple[int | None, list[dict[str, Any]], list[str]]:
    """Weighted suitability over the factors whose values are available.

    Returns (score 0-100 or None, per-factor detail rows, explanation lines).
    Unavailable factors are EXCLUDED from the denominator — never guessed.
    """
    details: list[dict[str, Any]] = []
    reasons: list[str] = []
    total_weight = 0.0
    weighted = 0.0
    unavailable: list[str] = []

    for f in factors:
        key = str(f.get("factor_key") or "")
        if not f.get("active", True) or key not in _scoreable_factors():
            continue
        try:
            weight = float(f.get("weight") or 0)
        except (TypeError, ValueError):
            weight = 0.0
        if weight <= 0:
            continue

        value = value_of(key)
        label = _factor_label(key)
        unit = str(f.get("unit") or "")
        if value is None:
            unavailable.append(label)
            details.append({
                "name": label, "factor_key": key, "value": None, "unit": unit,
                "impact": "Unavailable", "favorability": None,
                "range": _range_text(f),
            })
            continue

        suit = suitability(float(value), _opt_num(f.get("min_value")), _opt_num(f.get("max_value")))
        weighted += weight * suit
        total_weight += weight
        impact = impact_label(suit)
        details.append({
            "name": label, "factor_key": key, "value": _r1(value), "unit": unit,
            "impact": impact, "favorability": round(suit, 3),
            "range": _range_text(f),
        })
        if suit >= 0.75:
            reasons.append(
                f"{label} ({_r1(value)}{unit}) is inside the configured favorable range "
                f"{_range_text(f)} — strong contributor."
            )
        elif suit >= 0.45:
            reasons.append(
                f"{label} ({_r1(value)}{unit}) is near the favorable range {_range_text(f)} — moderate contributor."
            )

    score = round(100 * weighted / total_weight) if total_weight > 0 else None
    if unavailable:
        reasons.append("Not measured and therefore excluded: " + ", ".join(sorted(set(unavailable))) + ".")
    return score, details, reasons


def _scoreable_factors() -> tuple[str, ...]:
    from app.database.weather_crud import FACTOR_KEYS
    return FACTOR_KEYS


def _factor_label(key: str) -> str:
    from app.database.weather_crud import FACTOR_LABELS
    return FACTOR_LABELS.get(key, key.replace("_", " ").title())


def _opt_num(v: Any) -> float | None:
    return _num(v)


def _range_text(f: dict[str, Any]) -> str:
    mn, mx = _opt_num(f.get("min_value")), _opt_num(f.get("max_value"))
    unit = str(f.get("unit") or "")
    if mn is not None and mx is not None:
        return f"{_r1(mn)}–{_r1(mx)}{unit}"
    if mn is not None:
        return f"≥ {_r1(mn)}{unit}"
    if mx is not None:
        return f"≤ {_r1(mx)}{unit}"
    return "not configured"


# ── Analysis assembly ────────────────────────────────────────────────────────

def explain_favorability(disease_display: str, level: str, score: int | None) -> str:
    """Wording rules (§14): favorability language only — never 'causes',
    never 'will occur', never a probability that the plant has the disease."""
    if score is None or level == "Unavailable":
        return "Not enough measured weather data to rate conditions for this disease."
    if level in ("High", "Very High"):
        return (
            f"Current weather conditions are highly favorable for increased "
            f"{disease_display} risk. Environmental favorability only — this does not "
            f"confirm the disease is present."
        )
    if level == "Moderate":
        return (
            f"Some conditions partially favor {disease_display} development. "
            f"Monitor the crop; weather risk alone does not confirm disease."
        )
    return (
        f"Current conditions are largely unfavorable for {disease_display}. "
        f"Continue routine monitoring — conditions can change."
    )


def recommendations_for(level: str, score: int | None) -> list[str]:
    """General advisory actions (§20) — no fungicide/pesticide prescription."""
    if score is None or level == "Unavailable":
        return [
            "Weather data is incomplete for this location — check your connection or try again later.",
            "Inspect the crop visually and re-run an image prediction where possible.",
        ]
    base = [
        "Monitor the crop closely over the next few days.",
        "Inspect leaves for early disease symptoms.",
    ]
    if level in ("High", "Very High"):
        base += [
            "Recheck weather conditions daily while risk stays elevated.",
            "Follow local agricultural extension recommendations if symptoms appear.",
            "Consider scouting low-lying, dense-canopy areas first — they retain moisture longest.",
        ]
    elif level == "Moderate":
        base += [
            "Recheck weather conditions over the next few days.",
            "Increase scouting frequency while conditions remain partly favorable.",
        ]
    else:
        base.append("Continue scheduled scouting; no weather-driven action needed right now.")
    return base


def analyze_disease(profile: dict[str, Any], value_of: Any, thresholds: list[dict[str, Any]]) -> dict[str, Any]:
    factors = profile.get("factors") or []
    score, details, reasons = score_from_factors(factors, value_of)
    level = risk_level(score, thresholds)
    display = str(profile.get("display_name") or profile.get("disease_key") or "")
    return {
        "disease_key": profile.get("disease_key"),
        "disease_name": display,
        "scientific_name": profile.get("scientific_name") or "",
        "weather_risk_score": score,          # 0–100 or None — never a fake value
        "risk_level": level,
        "factors": details,
        "explanation": explain_favorability(display, level, score),
        "reasons": reasons,
    }


def analyze_all(
    profiles: list[dict[str, Any]],
    snapshot: WeatherSnapshot,
    daily: list[DailyConditions],
    thresholds: list[dict[str, Any]],
) -> dict[str, Any]:
    """Full risk payload for the user page: current-conditions risk per active
    disease + a 7-day per-disease trend. All math happens here, never in JS."""
    active = [p for p in profiles if p.get("active", True)]

    disease_risks = [
        analyze_disease(p, snapshot.factor_value, thresholds) for p in active
    ]
    disease_risks.sort(key=lambda d: (d["weather_risk_score"] is None, -(d["weather_risk_score"] or 0)))

    # 7-day trend: same engine, run over each day's normalized values.
    trend: list[dict[str, Any]] = []
    for i, day in enumerate(daily):
        per_disease = [
            analyze_disease(p, day.factor_value, thresholds) for p in active
        ]
        scored = [d for d in per_disease if d["weather_risk_score"] is not None]
        top = max(scored, key=lambda d: d["weather_risk_score"]) if scored else None
        trend.append({
            **day.as_dict(),
            "is_today": i == 0,
            "per_disease": [
                {"disease_key": d["disease_key"], "disease_name": d["disease_name"],
                 "weather_risk_score": d["weather_risk_score"], "risk_level": d["risk_level"]}
                for d in per_disease
            ],
            "highest_risk": {
                "disease_name": top["disease_name"], "risk_level": top["risk_level"],
                "weather_risk_score": top["weather_risk_score"],
            } if top else None,
        })

    alerts = [
        f"{d['disease_name']}: weather conditions rated {d['risk_level']} "
        f"(score {d['weather_risk_score']}/100) — environmental favorability signal, not a disease confirmation."
        for d in disease_risks
        if d["risk_level"] in ("High", "Very High")
    ]

    return {
        "disease_risks": disease_risks,
        "forecast": trend,
        "alerts": alerts,
    }
