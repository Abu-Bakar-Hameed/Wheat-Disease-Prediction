"""
WheatGuard AI – Weather Risk Routes (real data, backend-calculated)

GET /api/v1/weather/risk     → full disease-aware weather risk analysis
GET /api/v1/weather/current  → normalized current conditions (dashboard widget)

Data flow (§22): Open-Meteo → weather_service normalization → admin-managed
disease profiles (weather_crud) → backend scoring engine → this payload →
frontend render. The frontend performs no risk math and receives no raw
provider data it would have to interpret.

Location priority: ?lat&lon → ?location text (geocoded) → the requesting
user's own profile location → configured default. A Bearer token is
OPTIONAL (soft auth): anonymous visitors still get the full public analysis;
a signed-in user additionally gets "Your Prediction → Weather Risk for Your
Predicted Disease". Other users' locations/predictions are never exposed.

If the provider fails the routes answer 503 with exactly
"Weather data is currently unavailable." — no fabricated numbers, ever.
"""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Query, status
from jose import JWTError, jwt
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.logging import get_logger
from app.database import weather_crud
from app.database.crud import get_recent_predictions
from app.database.database import get_supabase_client
from app.ml import weather_service
from app.ml.weather_service import WeatherUnavailableError

router = APIRouter(prefix="/api/v1/weather", tags=["Weather Risk"])
logger = get_logger(__name__)

_UNAVAILABLE_MSG = "Weather data is currently unavailable."

DISCLAIMER = (
    "Weather risk describes environmental favorability only. It is NOT a "
    "diagnosis, does not measure disease presence, and does not prove that a "
    "disease will occur. Image-model confidence and weather risk are "
    "independent values."
)


# ── Schemas ───────────────────────────────────────────────────────────────────

class WeatherLocation(BaseModel):
    label: str
    source: str = Field(description="query | profile | default")
    latitude: float
    longitude: float


class RiskFactorDetail(BaseModel):
    name: str
    factor_key: str
    value: float | None
    unit: str
    impact: str
    favorability: float | None
    range: str


class DiseaseRiskOut(BaseModel):
    disease_key: str
    disease_name: str
    scientific_name: str = ""
    weather_risk_score: int | None = Field(default=None, ge=0, le=100)
    risk_level: str
    factors: list[RiskFactorDetail] = Field(default_factory=list)
    explanation: str
    reasons: list[str] = Field(default_factory=list)


class ForecastDayOut(BaseModel):
    date: str
    day_name: str
    temp_high: float | None
    temp_low: float | None
    temp_avg: float | None
    humidity_avg: float | None
    rainfall: float | None
    wind_speed: float | None
    dew_point: float | None
    is_today: bool
    per_disease: list[dict[str, Any]]
    highest_risk: dict[str, Any] | None


class YourPredictionRisk(BaseModel):
    """Image prediction and its (independent) weather risk, side by side."""

    disease_name: str
    model_confidence_pct: float
    severity: str
    predicted_at: str
    weather_risk_score: int | None
    weather_risk_level: str
    explanation: str
    factors: list[RiskFactorDetail] = Field(default_factory=list)
    reasons: list[str] = Field(default_factory=list)


class WeatherRiskOut(BaseModel):
    location: WeatherLocation
    current: dict[str, Any]
    disease_risks: list[DiseaseRiskOut]
    forecast: list[ForecastDayOut]
    alerts: list[str]
    recommendations: list[str]
    your_prediction: YourPredictionRisk | None = None
    risk_thresholds: list[dict[str, Any]]
    disclaimer: str
    generated_at: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _soft_user_id(authorization: str | None) -> str | None:
    """Best-effort identity: valid Bearer → user id, anything else → None.
    The public analysis must keep working for anonymous visitors."""
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    if not settings.jwt_secret_key:
        return None
    try:
        payload = jwt.decode(
            token, settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm], issuer="auth-api",
        )
        sub = payload.get("sub")
        return str(sub) if sub else None
    except JWTError:
        return None


def _profile_location(user_id: str) -> str | None:
    """The requesting user's OWN profile location (never anyone else's)."""
    try:
        resp = (
            get_supabase_client().table("profiles")
            .select("location").eq("id", user_id).maybe_single().execute()
        )
        loc = (resp.data or {}).get("location")
        loc = str(loc).strip() if loc else ""
        return loc or None
    except Exception as exc:
        logger.debug("Could not read profile location for %s: %s", user_id, exc)
        return None


async def _resolve_location(
    lat: float | None,
    lon: float | None,
    location: str | None,
    user_id: str | None,
) -> tuple[float, float, str, str]:
    """Returns (lat, lon, label, source)."""
    if lat is not None and lon is not None and -90 <= lat <= 90 and -180 <= lon <= 180:
        return lat, lon, f"{round(lat, 2)}, {round(lon, 2)}", "query"

    text = (location or "").strip()
    if not text and user_id:
        # Blocking Supabase read → keep it off the event loop.
        text = (await asyncio.to_thread(_profile_location, user_id)) or ""
        if text:
            geo = await weather_service.geocode(text)
            if geo:
                return geo[0], geo[1], geo[2], "profile"
            logger.info("Profile location %r could not be geocoded; using default", text)

    if text:
        geo = await weather_service.geocode(text)
        if geo:
            return geo[0], geo[1], geo[2], "query"

    return (
        settings.weather_default_latitude,
        settings.weather_default_longitude,
        settings.weather_default_location_label,
        "default",
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get(
    "/current",
    summary="Current weather conditions (real data)",
    description="Normalized live conditions from Open-Meteo for the resolved location.",
)
async def get_current_conditions(
    authorization: str | None = Header(default=None),
    lat: float | None = Query(default=None),
    lon: float | None = Query(default=None),
    location: str | None = Query(default=None, max_length=120),
) -> dict[str, Any]:
    user_id = _soft_user_id(authorization)
    rlat, rlon, label, source = await _resolve_location(lat, lon, location, user_id)
    try:
        snapshot, _days = await weather_service.fetch_weather(rlat, rlon)
    except WeatherUnavailableError:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=_UNAVAILABLE_MSG)
    return {
        "location": {"label": label, "source": source, "latitude": rlat, "longitude": rlon},
        "current": snapshot.as_dict(),
    }


@router.get(
    "/risk",
    response_model=WeatherRiskOut,
    response_model_exclude_none=True,
    summary="Disease-aware weather risk analysis",
    description=(
        "Calculates every disease's weather suitability score on the backend "
        "from admin-managed profiles. Bearer token optional — signed-in users "
        "also receive the weather risk for their own latest image prediction."
    ),
)
async def get_weather_risk(
    background: BackgroundTasks,
    authorization: str | None = Header(default=None),
    lat: float | None = Query(default=None),
    lon: float | None = Query(default=None),
    location: str | None = Query(default=None, max_length=120),
) -> WeatherRiskOut:
    user_id = _soft_user_id(authorization)
    rlat, rlon, label, source = await _resolve_location(lat, lon, location, user_id)

    # The two admin-config reads and the Open-Meteo fetch are independent, so
    # run them concurrently. The config reads are cached (weather_crud) and the
    # provider call is cached per coordinate, so steady-state this resolves in
    # roughly one round-trip instead of several serial ones.
    try:
        profiles, thresholds, (snapshot, daily) = await asyncio.gather(
            asyncio.to_thread(weather_crud.list_profiles),
            asyncio.to_thread(weather_crud.list_thresholds),
            weather_service.fetch_weather(rlat, rlon),
        )
    except WeatherUnavailableError:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=_UNAVAILABLE_MSG)

    analysis = weather_service.analyze_all(profiles, snapshot, daily, thresholds)
    disease_risks = [DiseaseRiskOut(**d) for d in analysis["disease_risks"]]
    forecast = [ForecastDayOut(**f) for f in analysis["forecast"]]

    # ── Your prediction → weather risk (kept explicitly separate, §10) ──────
    your_prediction: YourPredictionRisk | None = None
    recommendations: list[str] = []
    focus: DiseaseRiskOut | None = None

    if user_id:
        try:
            records, _total = await asyncio.to_thread(
                get_recent_predictions, user_id=user_id, limit=1
            )
        except Exception as exc:
            logger.warning("Latest prediction lookup failed for %s: %s", user_id, exc)
            records = []
        if records:
            rec = records[0]
            match = next(
                (d for d in disease_risks
                 if str(d.disease_key).lower() == rec.predicted_class.lower()),
                None,
            )
            if match is None:
                # Predicted class has no active profile (e.g. a new ML class
                # before seeding) — score it on the fly from a transient profile.
                transient = {
                    "disease_key": rec.predicted_class,
                    "display_name": rec.predicted_class.replace("_", " ").title(),
                    "scientific_name": "",
                    "active": True,
                    "factors": [],
                }
                scored = weather_service.analyze_disease(transient, snapshot.factor_value, thresholds)
                match = DiseaseRiskOut(**scored)
            your_prediction = YourPredictionRisk(
                disease_name=match.disease_name,
                model_confidence_pct=float(rec.confidence_pct),
                severity=rec.severity,
                predicted_at=str(rec.created_at),
                weather_risk_score=match.weather_risk_score,
                weather_risk_level=match.risk_level,
                explanation=(
                    "Your latest prediction was Healthy — weather risk describes "
                    "disease pressure, not healthy crops. Continue routine monitoring."
                    if "healthy" in rec.predicted_class.lower()
                    else (
                        "The weather risk above is calculated independently from "
                        "the image model — model confidence and weather suitability "
                        "are different values."
                        if match.weather_risk_score is not None
                        else match.explanation
                    )
                ),
                factors=match.factors,
                reasons=match.reasons,
            )
            focus = match
            recommendations = weather_service.recommendations_for(
                "Low" if "healthy" in rec.predicted_class.lower() else focus.risk_level,
                10 if "healthy" in rec.predicted_class.lower() else focus.weather_risk_score,
            )

    if not recommendations:
        top = next((d for d in disease_risks if d.weather_risk_score is not None), None)
        recommendations = weather_service.recommendations_for(
            top.risk_level if top else "Unavailable",
            top.weather_risk_score if top else None,
        )

    # Best-effort analytics trail; failures never break the response. Run it
    # after the response is sent so the (cached) write never adds latency.
    background.add_task(
        asyncio.to_thread,
        weather_crud.log_risk,
        user_id, label,
        [
            {"disease_key": d.disease_key, "score": d.weather_risk_score,
             "level": d.risk_level, "factors": [f.model_dump() for f in d.factors]}
            for d in disease_risks if d.weather_risk_score is not None
        ][:4],
    )

    return WeatherRiskOut(
        location=WeatherLocation(label=label, source=source, latitude=rlat, longitude=rlon),
        current=snapshot.as_dict(),
        disease_risks=disease_risks,
        forecast=forecast,
        alerts=analysis["alerts"],
        recommendations=recommendations,
        your_prediction=your_prediction,
        risk_thresholds=thresholds,
        disclaimer=DISCLAIMER,
        generated_at=snapshot.observed_at,
    )
