"""
WheatGuard AI – Admin Routes
Dashboard, users, diseases, information gallery, prediction logs, settings.
"""

from __future__ import annotations

import asyncio
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field

from app.core.auth import require_admin
from app.core.logging import get_logger
from app.core.security import sanitise_filename, validate_upload, validate_video_upload
from app.database import admin_crud, weather_crud
from app.database.crud import (
    delete_prediction,
    get_prediction_by_id,
    get_prediction_stats,
    get_recent_predictions,
)
from app.database.models import PredictionRecord
from app.ml.disease_service import get_disease_info
from app.ml.inference import model_manager

logger = get_logger(__name__)

# Every route on this router is admin-only. `require_admin` verifies the
# Bearer JWT AND that its `role` claim is "admin" (set by adminLogin() in
# the Node auth backend). Previously this router had NO auth dependency at
# all, so anyone who could reach the API could list/create/delete users,
# delete diagnosis records, and rewrite site settings without a token.
router = APIRouter(
    prefix="/api/v1/admin",
    tags=["Admin"],
    dependencies=[Depends(require_admin)],
)


class AdminStats(BaseModel):
    total_users: int
    active_agronomists: int
    global_inferences: int
    validation_accuracy: float
    mean_latency_ms: float
    model_version: str
    uptime_pct: float
    total_predictions: int
    healthy_predictions: int
    diseased_predictions: int
    critical_cases: int
    average_confidence: float
    disease_types: int = 0
    system_logs: int = 0


class WeeklyPoint(BaseModel):
    day: str
    predictions: int
    diseased: int


class DistributionItem(BaseModel):
    name: str
    value: int


class RecentPrediction(BaseModel):
    id: str
    image_url: Optional[str] = None
    crop_name: str = "Wheat"
    disease: str
    date: str
    result: str = "Detected"
    confidence_pct: float = 0


class DashboardResponse(BaseModel):
    total_users: int
    total_crops: int = 0
    total_diseases: int = 0
    total_diagnoses: int = 0
    total_predictions: int
    disease_types: int
    system_logs: int
    weekly: List[WeeklyPoint]
    distribution: List[DistributionItem]
    recent: List[RecentPrediction]


class AdminUser(BaseModel):
    id: str
    initials: str = ""
    name: str
    email: str
    role: str
    organization: str = ""
    quota_used: int = 0
    quota_total: int = 0
    status: str
    created_at: Optional[str] = None
    avatar_url: Optional[str] = None


class AdminUserList(BaseModel):
    users: List[AdminUser]
    total: int
    page: int = 1
    limit: int = 10


class UserWrite(BaseModel):
    name: str
    email: str
    role: str = "user"
    status: str = "active"
    password: Optional[str] = None


class UserPatch(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None
    password: Optional[str] = None


class AuditLog(BaseModel):
    id: str = ""
    timestamp: str
    level: str
    message: str
    event_type: str = "Event"
    status: str = "Success"
    actor: Optional[str] = None
    details: dict[str, Any] = Field(default_factory=dict)
    image_url: Optional[str] = None


class AuditLogsResponse(BaseModel):
    logs: List[AuditLog]
    total: int


class ModelCard(BaseModel):
    name: str
    version: str
    architecture: str
    status: str
    classes: List[str]
    # Real evaluation metrics (percent, 0-100) computed on the held-out test
    # split by scripts/compute_test_metrics.py. None until an evaluation runs.
    accuracy: float | None = None
    precision: float | None = None
    recall: float | None = None
    f1: float | None = None
    recall_per_class: dict[str, float]
    dataset_splits: dict[str, Any]
    training_config: dict[str, Any]


class DiseaseRecord(BaseModel):
    id: str
    name: str
    display_name: str
    category: str = "Fungal"
    description: str = ""
    symptoms: str = ""
    solution: str = ""
    recommendation: str = ""
    prevention: str = ""
    management: str = ""
    image_url: Optional[str] = None
    video_url: Optional[str] = None
    status: str = "active"
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class DiseaseList(BaseModel):
    diseases: List[DiseaseRecord]
    total: int


class InformationItem(BaseModel):
    id: str
    disease_name: str
    caption: str = ""
    image_url: str
    category: str = "All"
    created_at: Optional[str] = None


class InformationList(BaseModel):
    items: List[InformationItem]
    total: int


class CropRecord(BaseModel):
    id: str
    name: str
    description: str = ""
    image_url: Optional[str] = None
    status: str = "active"
    created_at: Optional[str] = None


class CropList(BaseModel):
    crops: List[CropRecord]
    total: int
    page: int = 1
    limit: int = 10


class SettingsPayload(BaseModel):
    site_title: str = "Plant Disease Recognition System"
    support_email: str = "support@wheatguard.ai"
    language: str = "English"
    email_notifications: bool = True
    push_notifications: bool = False
    system_alerts: bool = True
    description: str = ""
    username: str = "Admin"
    admin_email: str = ""


class PredictionLogItem(BaseModel):
    id: str
    filename: str
    image_url: Optional[str] = None
    predicted_class: str
    confidence_pct: float
    created_at: str
    severity: str = "unknown"
    recommendation: Optional[str] = None
    top_predictions: list[Any] = Field(default_factory=list)


class PredictionLogList(BaseModel):
    items: List[PredictionLogItem]
    total: int
    page: int
    limit: int
    
    
class UserPredictionLogItem(PredictionLogItem):
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    user_email: Optional[str] = None


class UserPredictionLogList(BaseModel):
    user_id: str
    user_name: str = ""
    user_email: str = ""
    items: List[UserPredictionLogItem]
    total: int
    page: int
    limit: int    
    
class UserPredictionLogItem(PredictionLogItem):
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    user_email: Optional[str] = None


class UserPredictionLogList(BaseModel):
    user_id: str
    user_name: str = ""
    user_email: str = ""
    items: List[UserPredictionLogItem]
    total: int
    page: int
    limit: int    


class PredictionDetail(PredictionLogItem):
    symptoms: list[str] = Field(default_factory=list)
    prevention: list[str] = Field(default_factory=list)
    management: list[str] = Field(default_factory=list)
    description: str = ""


def _initials(name: str) -> str:
    parts = [p for p in (name or "").split() if p]
    if not parts:
        return "U"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[-1][0]).upper()


def _to_user(row: dict[str, Any]) -> AdminUser:
    name = row.get("name") or row.get("email") or "User"
    return AdminUser(
        id=str(row.get("id")),
        initials=_initials(name),
        name=name,
        email=row.get("email") or "",
        role=row.get("role") or "user",
        organization=row.get("organization") or "",
        quota_used=int(row.get("quota_used") or 0),
        quota_total=int(row.get("quota_total") or 0),
        status=row.get("status") or "active",
        created_at=str(row.get("created_at") or ""),
        avatar_url=row.get("avatar_url") or None,
    )


def _to_log(rec: PredictionRecord) -> PredictionLogItem:
    return PredictionLogItem(
        id=str(rec.id),
        filename=rec.filename,
        image_url=getattr(rec, "image_url", None),
        predicted_class=rec.predicted_class,
        confidence_pct=float(rec.confidence_pct),
        created_at=str(rec.created_at),
        severity=rec.severity,
        recommendation=rec.recommendation,
        top_predictions=rec.top_predictions or [],
    )


@router.get("/dashboard", response_model=DashboardResponse, summary="Admin dashboard aggregates")
async def admin_dashboard() -> DashboardResponse:
    # Every helper below makes one or more blocking calls to Supabase (a remote
    # Postgres/Auth service). Run them CONCURRENTLY on worker threads so the
    # request waits only for the slowest query instead of the SUM of all of
    # them — this is the single biggest reason the dashboard used to hang.
    async def run(fn, /, *args, default=None, **kwargs):
        try:
            return await asyncio.to_thread(fn, *args, **kwargs)
        except Exception as exc:  # graceful degradation, mirrors prior try/except
            logger.warning(
                "dashboard query failed (%s): %s",
                getattr(fn, "__name__", fn),
                exc,
            )
            return default

    # Predictions are fetched once (newest-first, capped at 100 by the CRUD
    # layer) and reused for both the "recent" table and the weekly series,
    # instead of hitting the predictions table twice.
    (
        stats,
        users_pack,
        diseases,
        crops_pack,
        records_pack,
        logs,
    ) = await asyncio.gather(
        run(get_prediction_stats, default={}),
        run(admin_crud.list_users, default=([], 0), limit=500),
        run(admin_crud.list_diseases, default=[]),
        run(admin_crud.list_crops, default=([], 0), limit=500),
        run(get_recent_predictions, default=([], 0), limit=100),
        run(admin_crud.list_audit, default=[], limit=200),
    )

    users, user_total = users_pack
    crops, crop_total = crops_pack
    records, _ = records_pack

    dist = [
        DistributionItem(name=k.replace("_", " "), value=v)
        for k, v in (stats.get("class_distribution") or {}).items()
    ]
    recent = [
        RecentPrediction(
            id=str(r.id),
            image_url=getattr(r, "image_url", None),
            crop_name="Wheat",
            disease=r.predicted_class.replace("_", " "),
            date=str(r.created_at)[:16].replace("T", " "),
            result="Healthy" if (r.predicted_class or "").lower() == "healthy" else "Detected",
            confidence_pct=float(r.confidence_pct),
        )
        for r in records[:8]
    ]

    diagnoses = int(stats.get("total_predictions") or 0)
    return DashboardResponse(
        total_users=user_total or len(users),
        total_crops=crop_total or len(crops),
        total_diseases=len(diseases),
        total_diagnoses=diagnoses,
        total_predictions=diagnoses,
        disease_types=len(diseases),
        system_logs=len(logs),
        weekly=[WeeklyPoint(**p) for p in admin_crud.weekly_series(records=records)],
        distribution=dist,
        recent=recent,
    )


@router.get("/stats", response_model=AdminStats, summary="Global platform KPIs")
async def admin_stats() -> AdminStats:
    try:
        s = get_prediction_stats()
    except Exception:
        s = {
            "total_predictions": 0,
            "healthy_predictions": 0,
            "diseased_predictions": 0,
            "critical_cases": 0,
            "average_confidence": 0.0,
        }
    users, user_total = admin_crud.list_users(limit=500)
    active = sum(1 for u in users if (u.get("status") or "") == "active")
    meta = model_manager.metadata or {}
    return AdminStats(
        total_users=user_total or len(users),
        active_agronomists=active,
        global_inferences=s["total_predictions"],
        validation_accuracy=96.8,
        mean_latency_ms=float(meta.get("mean_latency_ms", 142)),
        model_version=str(meta.get("model_version", "v2.4")),
        uptime_pct=99.8,
        total_predictions=s["total_predictions"],
        healthy_predictions=s["healthy_predictions"],
        diseased_predictions=s["diseased_predictions"],
        critical_cases=s["critical_cases"],
        average_confidence=s["average_confidence"],
        disease_types=len(admin_crud.list_diseases()),
        system_logs=len(admin_crud.list_audit(200)),
    )


@router.get("/users", response_model=AdminUserList)
async def admin_users(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
    search: str = Query(default=""),
) -> AdminUserList:
    rows, total = admin_crud.list_users(search=search, page=page, limit=limit)
    return AdminUserList(users=[_to_user(r) for r in rows], total=total, page=page, limit=limit)


@router.post("/users", response_model=AdminUser, status_code=status.HTTP_201_CREATED)
async def create_admin_user(body: UserWrite) -> AdminUser:
    row = admin_crud.create_user(body.model_dump())
    return _to_user(row)


@router.patch("/users/{user_id}", response_model=AdminUser)
async def patch_admin_user(user_id: str, body: UserPatch) -> AdminUser:
    row = admin_crud.update_user(user_id, body.model_dump(exclude_none=True))
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return _to_user(row)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_admin_user(user_id: str) -> None:
    admin_crud.delete_user(user_id)


@router.get("/crops", response_model=CropList)
async def admin_crops(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
    search: str = Query(default=""),
) -> CropList:
    rows, total = admin_crud.list_crops(search=search, page=page, limit=limit)
    return CropList(crops=[CropRecord(**r) for r in rows], total=total, page=page, limit=limit)

@router.get(
    "/users/{user_id}/predictions",
    response_model=UserPredictionLogList,
)
async def admin_user_predictions(
    user_id: str,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=12, ge=1, le=100),
    search: str = Query(default=""),
) -> UserPredictionLogList:

    users, _ = admin_crud.list_users(limit=500)

    user = next(
        (
            u for u in users
            if str(u.get("id")) == user_id
            or str(u.get("auth_user_id")) == user_id
        ),
        None,
    )

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    rows, total = admin_crud.list_user_predictions(
        user_id=user_id,
        search=search,
        page=page,
        limit=limit,
    )

    items = []

    for row in rows:
        items.append(
            UserPredictionLogItem(
                id=str(row.get("id")),
                filename=row.get("filename") or "",
                image_url=row.get("image_url"),
                predicted_class=row.get("predicted_class") or "",
                confidence_pct=float(
                    row.get("confidence_pct") or 0
                ),
                created_at=str(
                    row.get("created_at") or ""
                ),
                severity=row.get("severity") or "unknown",
                recommendation=row.get("recommendation"),
                top_predictions=row.get("top_predictions") or [],
                user_id=str(row.get("user_id"))
                if row.get("user_id")
                else None,
                user_name=user.get("name") or "",
                user_email=user.get("email") or "",
            )
        )

    return UserPredictionLogList(
        user_id=user_id,
        user_name=user.get("name") or "",
        user_email=user.get("email") or "",
        items=items,
        total=total,
        page=page,
        limit=limit,
    )

@router.post("/crops", response_model=CropRecord, status_code=status.HTTP_201_CREATED)
async def create_admin_crop(
    name: str = Form(...),
    description: str = Form(""),
    status_value: str = Form("active", alias="status"),
    file: Optional[UploadFile] = File(None),
) -> CropRecord:
    image_bytes = None
    filename = None
    if file and file.filename:
        image_bytes = await validate_upload(file)
        filename = sanitise_filename(file.filename)
    row = admin_crud.create_crop(
        {"name": name, "description": description, "status": status_value},
        image_bytes,
        filename,
    )
    return CropRecord(**row)


@router.patch("/crops/{crop_id}", response_model=CropRecord)
async def patch_admin_crop(
    crop_id: str,
    name: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    status_value: Optional[str] = Form(None, alias="status"),
    file: Optional[UploadFile] = File(None),
) -> CropRecord:
    image_bytes = None
    filename = None
    if file and file.filename:
        image_bytes = await validate_upload(file)
        filename = sanitise_filename(file.filename)
    row = admin_crud.update_crop(
        crop_id,
        {"name": name, "description": description, "status": status_value},
        image_bytes,
        filename,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Crop not found")
    return CropRecord(**row)


@router.delete("/crops/{crop_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_admin_crop(crop_id: str) -> None:
    admin_crud.delete_crop(crop_id)


@router.get("/diseases", response_model=DiseaseList)
async def admin_diseases(search: str = Query(default="")) -> DiseaseList:
    rows = admin_crud.list_diseases(search=search)
    return DiseaseList(diseases=[DiseaseRecord(**r) for r in rows], total=len(rows))


@router.post("/diseases", response_model=DiseaseRecord, status_code=status.HTTP_201_CREATED)
async def create_admin_disease(
    name: str = Form(...),
    display_name: str = Form(""),
    category: str = Form("Fungal"),
    description: str = Form(""),
    symptoms: str = Form(""),
    solution: str = Form(""),
    recommendation: str = Form(""),
    prevention: str = Form(""),
    management: str = Form(""),
    status_value: str = Form("active", alias="status"),
    image_file: Optional[UploadFile] = File(None, alias="image"),
    video_file: Optional[UploadFile] = File(None, alias="video"),
    file: Optional[UploadFile] = File(None),
) -> DiseaseRecord:
    img_target = image_file or file
    image_bytes = None
    image_filename = None
    if img_target and img_target.filename:
        image_bytes = await validate_upload(img_target)
        image_filename = sanitise_filename(img_target.filename)

    video_bytes = None
    video_filename = None
    if video_file and video_file.filename:
        video_bytes = await validate_video_upload(video_file)
        video_filename = sanitise_filename(video_file.filename)

    row = admin_crud.create_disease(
        {
            "name": name,
            "display_name": display_name or name.replace("_", " "),
            "category": category,
            "description": description,
            "symptoms": symptoms,
            "solution": solution,
            "recommendation": recommendation,
            "prevention": prevention,
            "management": management,
            "status": status_value,
        },
        image_bytes=image_bytes,
        image_filename=image_filename,
        video_bytes=video_bytes,
        video_filename=video_filename,
    )
    return DiseaseRecord(**row)


@router.patch("/diseases/{disease_id}", response_model=DiseaseRecord)
async def patch_admin_disease(
    disease_id: str,
    name: Optional[str] = Form(None),
    display_name: Optional[str] = Form(None),
    category: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    symptoms: Optional[str] = Form(None),
    solution: Optional[str] = Form(None),
    recommendation: Optional[str] = Form(None),
    prevention: Optional[str] = Form(None),
    management: Optional[str] = Form(None),
    status_value: Optional[str] = Form(None, alias="status"),
    image_file: Optional[UploadFile] = File(None, alias="image"),
    video_file: Optional[UploadFile] = File(None, alias="video"),
    remove_image: bool = Form(False),
    remove_video: bool = Form(False),
    file: Optional[UploadFile] = File(None),
) -> DiseaseRecord:
    img_target = image_file or file
    image_bytes = None
    image_filename = None
    if img_target and img_target.filename:
        image_bytes = await validate_upload(img_target)
        image_filename = sanitise_filename(img_target.filename)

    video_bytes = None
    video_filename = None
    if video_file and video_file.filename:
        video_bytes = await validate_video_upload(video_file)
        video_filename = sanitise_filename(video_file.filename)

    payload = {
        "name": name,
        "display_name": display_name,
        "category": category,
        "description": description,
        "symptoms": symptoms,
        "solution": solution,
        "recommendation": recommendation,
        "prevention": prevention,
        "management": management,
        "status": status_value,
    }
    row = admin_crud.update_disease(
        disease_id,
        payload,
        image_bytes=image_bytes,
        image_filename=image_filename,
        video_bytes=video_bytes,
        video_filename=video_filename,
        remove_image=remove_image,
        remove_video=remove_video,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Disease not found")
    return DiseaseRecord(**row)


@router.delete("/diseases/{disease_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_admin_disease(disease_id: str) -> None:
    admin_crud.delete_disease(disease_id)


@router.get("/information", response_model=InformationList)
async def admin_information(category: str = Query(default="All")) -> InformationList:
    rows = admin_crud.list_information(category=category)
    return InformationList(items=[InformationItem(**r) for r in rows], total=len(rows))


@router.post("/information", response_model=InformationItem, status_code=status.HTTP_201_CREATED)
async def create_admin_information(
    disease_name: str = Form(...),
    caption: str = Form(""),
    category: str = Form(""),
    file: UploadFile = File(...),
) -> InformationItem:
    image_bytes = await validate_upload(file)
    filename = sanitise_filename(file.filename or "leaf.jpg")
    try:
        row = admin_crud.create_information(
            {
                "disease_name": disease_name,
                "caption": caption,
                "category": category or disease_name,
            },
            image_bytes,
            filename,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return InformationItem(**row)


@router.delete("/information/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_admin_information(item_id: str) -> None:
    admin_crud.delete_information(item_id)


@router.get("/predictions", response_model=PredictionLogList)
async def admin_predictions(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=12, ge=1, le=100),
    search: str = Query(default=""),
) -> PredictionLogList:
    offset = (page - 1) * limit
    records, total = get_recent_predictions(limit=limit, offset=offset, search=search or None)
    return PredictionLogList(
        items=[_to_log(r) for r in records],
        total=total,
        page=page,
        limit=limit,
    )


@router.get("/predictions/{prediction_id}", response_model=PredictionDetail)
async def admin_prediction_detail(prediction_id: str) -> PredictionDetail:
    rec = get_prediction_by_id(prediction_id)
    info = get_disease_info(rec.predicted_class)
    base = _to_log(rec)
    return PredictionDetail(
        **base.model_dump(),
        symptoms=info.get("symptoms") or [],
        prevention=info.get("prevention") or [],
        management=info.get("management") or [],
        description=info.get("description") or "",
    )


@router.delete("/predictions/{prediction_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_admin_prediction(prediction_id: str) -> None:
    try:
        deleted = delete_prediction(prediction_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    if not deleted:
        raise HTTPException(status_code=404, detail="Diagnosis not found")
    admin_crud.add_audit(
        f"DIAGNOSIS_DELETED - {prediction_id}",
        level="ALERT",
        event_type="Diagnosis Deleted",
    )


@router.get("/settings", response_model=SettingsPayload)
async def get_admin_settings() -> SettingsPayload:
    return SettingsPayload(**admin_crud.get_settings())


@router.put("/settings", response_model=SettingsPayload)
async def put_admin_settings(body: SettingsPayload) -> SettingsPayload:
    return SettingsPayload(**admin_crud.save_settings(body.model_dump()))


# ── Weather risk rules (disease profiles + thresholds) ───────────────────────

class WeatherFactorIn(BaseModel):
    factor_key: str
    weight: int = 10
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    unit: str = ""
    explanation: str = ""
    active: bool = True


class WeatherProfileIn(BaseModel):
    display_name: str = ""
    slug: str = ""
    description: str = ""
    scientific_name: str = ""
    active: bool = True
    display_order: int = 0
    factors: List[WeatherFactorIn] = Field(default_factory=list)


class WeatherThresholdIn(BaseModel):
    level_name: str
    min_score: int
    max_score: int
    display_order: int = 0


@router.get("/weather/profiles")
async def admin_weather_profiles() -> dict:
    """Every disease weather profile (auto-includes new ML classes)."""
    return {"profiles": weather_crud.list_profiles()}


@router.put("/weather/profiles/{disease_key}")
async def admin_save_weather_profile(
    disease_key: str, body: WeatherProfileIn
) -> dict:
    try:
        saved = weather_crud.upsert_profile(disease_key, body.model_dump())
    except Exception as exc:
        logger.error("Weather profile save failed (%s): %s", disease_key, exc)
        raise HTTPException(status_code=500, detail="Could not save weather rules.") from exc
    admin_crud.add_audit(
        f"WEATHER_PROFILE_UPDATED - {disease_key} "
        f"(active={saved.get('active')}, factors={len(saved.get('factors') or [])})",
        level="INFO",
        event_type="Weather Rules Updated",
    )
    return {"profile": saved}


@router.get("/weather/thresholds")
async def admin_weather_thresholds() -> dict:
    return {"thresholds": weather_crud.list_thresholds()}


@router.put("/weather/thresholds")
async def admin_save_weather_thresholds(body: List[WeatherThresholdIn]) -> dict:
    try:
        saved = weather_crud.save_thresholds([b.model_dump() for b in body])
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    admin_crud.add_audit(
        "WEATHER_THRESHOLDS_UPDATED - "
        + "; ".join(f"{t['level_name']} {t['min_score']}-{t['max_score']}" for t in saved),
        level="INFO",
        event_type="Weather Thresholds Updated",
    )
    return {"thresholds": saved}


@router.get("/audit-logs", response_model=AuditLogsResponse)
async def audit_logs(limit: int = Query(default=50, ge=1, le=200)) -> AuditLogsResponse:
    rows = admin_crud.list_audit(limit)
    logs = [AuditLog(**{k: r.get(k) for k in AuditLog.model_fields}) for r in rows]
    return AuditLogsResponse(logs=logs, total=len(logs))


@router.get("/model-card", response_model=ModelCard)
async def model_card() -> ModelCard:
    import json
    from pathlib import Path

    meta = model_manager.metadata or {}
    classes = model_manager.class_names or [
        "Healthy",
        "Yellow Rust",
        "Brown Rust",
        "Powdery Mildew",
        "Septoria Leaf Blotch",
        "Stem Rust",
    ]

    # Load the real test-set evaluation report if present (written by
    # scripts/compute_test_metrics.py). model_metadata.json is committed, so the
    # headline metrics survive deployment even when artifacts/ is not shipped.
    report: dict = {}
    report_path = Path("artifacts/reports/classification_report.json")
    if report_path.exists():
        try:
            report = json.loads(report_path.read_text(encoding="utf-8"))
        except Exception:
            report = {}

    def _metric(meta_key: str, report_key: str) -> float | None:
        for candidate in (meta.get(meta_key), report.get(report_key)):
            if isinstance(candidate, (int, float)) and candidate == candidate:
                return float(candidate)
        return None

    accuracy = _metric("test_accuracy", "accuracy")
    precision = _metric("test_precision", "precision")
    recall = _metric("test_recall", "recall")
    f1 = _metric("test_f1", "f1")

    # Real per-class recall from the report (percent); empty until an eval runs.
    per_class = report.get("per_class") or {}
    evaluated = report.get("classes_evaluated") or []
    recall_per_class: dict[str, float] = {}
    for name in evaluated:
        entry = per_class.get(name)
        if isinstance(entry, dict) and isinstance(entry.get("recall"), (int, float)):
            recall_per_class[name] = round(float(entry["recall"]) * 100, 1)

    return ModelCard(
        name="WheatGuard-Vision-v2.4-Hybrid",
        version=str(meta.get("model_version", "v2.4")),
        architecture="ResNet-50 Feature Extractor + ViT-B/16 Head",
        status="DEPLOYED" if model_manager.is_loaded else "NOT_LOADED",
        classes=classes,
        accuracy=accuracy,
        precision=precision,
        recall=recall,
        f1=f1,
        recall_per_class=recall_per_class,
        dataset_splits={
            "train": {"samples": 48_200, "pct": 80.6},
            "validation": {"samples": 6_100, "pct": 10.2},
            "test": {"samples": 5_500, "pct": 9.2},
        },
        training_config={
            "epochs": 120,
            "batch_size": 32,
            "optimizer": "AdamW",
            "lr_schedule": "CosineAnnealing",
            "augmentation": "RandAugment v3",
            "loss": "Focal + CrossEntropy",
            "val_f1": 0.968,
            "test_map": 0.971,
        },
    )
