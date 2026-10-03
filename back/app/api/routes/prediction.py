"""
WheatGuard AI – Prediction Route
POST /api/v1/predict                        →  accept image, run inference, return full result.
POST /api/v1/predictions/diagnosis-report/{id}  →  regenerate the AI report for a record.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Path, UploadFile, status

from app.core.auth import get_current_user_claims, get_current_user_id
from app.core.exceptions import (
    DatabaseError,
    ImageTooLargeError,
    InferenceError,
    InvalidImageError,
    ModelNotLoadedError,
    NotAWheatLeafError,
    UnsupportedImageError,
)
from app.core.logging import get_logger
from app.core.security import compute_image_hash, sanitise_filename, validate_upload, validate_wheat_leaf_content
from app.database.activity_crud import record_activity
from app.database.database import get_supabase_client
from app.database.crud import (
    create_prediction,
    get_prediction_by_id,
    update_prediction_ai_report,
)
from app.database.storage import upload_image
from app.ml.alert_service import maybe_send_disease_alert
from app.ml.disease_service import get_disease_info, get_recommendation
from app.ml.openrouter_service import generate_diagnosis_report
from app.ml.gradcam import run_gradcam
from app.ml.inference import model_manager
from app.schemas.prediction import (
    AiDiagnosisReport,
    DiseaseInfo,
    GradCAMResult,
    PredictionResponse,
    TopPrediction,
)

router = APIRouter(prefix="/api/v1", tags=["Prediction"])
logger = get_logger(__name__)


def _confidence_level(pct: float) -> str:
    """Map confidence percentage to a human-readable level label."""
    if pct >= 80:
        return "High"
    elif pct >= 60:
        return "Moderate"
    elif pct >= 40:
        return "Low"
    else:
        return "Very Low"


def _notify_admins_of_prediction(
    *,
    user_id: str,
    claims: dict[str, Any],
    prediction_id: str,
    disease: str,
    confidence_pct: float,
    severity: str,
) -> None:
    """Ping every admin's bell when a user runs a prediction.

    Admins are resolved from `profiles.role = 'admin'` (the same source the
    admin panel reads). One notifications row is inserted per admin, which
    the auth service then serves at GET /api/notifications for the admin's
    own JWT — no user-side bell is involved.

    Notes on the row shape:
    * `notifications.type` has a fixed CHECK list with no prediction value,
      so this uses 'system' and carries the specifics in `metadata`.
    * `category='admin'` keeps it out of the general/security feeds.
    * Timestamps and is_read are left to DB defaults — never send the SQL
      literal "now()" as a value (PostgREST rejects the whole row).

    Best-effort by design: a notification failure must never break the
    prediction result the farmer is waiting on.
    """
    try:
        client = get_supabase_client()
        admins = (
            client.table("profiles")
            .select("id")
            .eq("role", "admin")
            .execute()
            .data
            or []
        )
        # A predicting admin does not need a notification to themselves.
        admin_ids = [str(a["id"]) for a in admins if str(a.get("id", "")) != user_id]
        if not admin_ids:
            return

        actor = str(claims.get("name") or claims.get("email") or "A user")
        actor_email = str(claims.get("email") or "")
        is_severe = str(severity).lower() in ("high", "critical")
        link = (
            f"/admin/predictions/{prediction_id}"
            if prediction_id and prediction_id != "unavailable"
            else None
        )

        rows = [
            {
                "user_id": admin_id,
                "title": f"New prediction: {disease}",
                "message": (
                    f"{actor} ({actor_email}) predicted {disease} at "
                    f"{confidence_pct:.1f}% confidence — severity: {severity}."
                ),
                "type": "system",
                "category": "admin",
                "priority": "high" if is_severe else "normal",
                "action_url": link,
                "metadata": {
                    "source": "prediction_activity",
                    "predictor_user_id": user_id,
                    "predictor_name": actor,
                    "predictor_email": actor_email,
                    "prediction_id": prediction_id,
                    "disease": disease,
                    "confidence_pct": confidence_pct,
                    "severity": severity,
                },
            }
            for admin_id in admin_ids
        ]
        client.table("notifications").insert(rows).execute()
    except Exception as exc:
        logger.warning(
            "Could not notify admins about prediction=%s: %s", prediction_id, exc
        )


@router.post(
    "/predict",
    response_model=PredictionResponse,
    status_code=status.HTTP_200_OK,
    summary="Predict wheat disease from an uploaded image",
    description=(
        "Upload a wheat-leaf photograph (JPG / PNG / WebP, max 10 MB). "
        "Returns the AI prediction, confidence score, severity, top-3 candidates, "
        "Grad-CAM visual explanation, and agronomic guidance.\n\n"
        "> **Disclaimer**: This is an AI Prediction. "
        "Consult an agricultural expert for confirmation."
    ),
    responses={
        200: {"description": "Prediction successful"},
        413: {"description": "Image too large (max 10 MB)"},
        415: {"description": "Unsupported image format"},
        422: {"description": "Invalid or unreadable image, or image does not appear to be a wheat leaf"},
        503: {"description": "Model not loaded"},
        500: {"description": "Inference error"},
    },
)
async def predict(
    file: UploadFile = File(..., description="Wheat leaf image (JPG/PNG/WebP, max 10 MB)"),
    include_gradcam: bool = Form(default=True, description="Include Grad-CAM visual explanation"),
    top_k: int = Form(default=3, ge=1, le=10, description="Number of top predictions to return"),
    save_history: bool = Form(
        default=True,
        description="Persist the scan to the user's history (Settings → Prediction → save predictions automatically)",
    ),
    store_image: bool = Form(
        default=True,
        description="Keep the original image in Storage (Settings → Prediction → keep original images)",
    ),
    claims: dict[str, Any] = Depends(get_current_user_claims),
) -> PredictionResponse:
    """
    Full prediction pipeline:

    1. Validate & read the uploaded file.
    2. Run model inference (top-k predictions + confidence).
    3. Calculate confidence level label and severity.
    4. Optionally generate Grad-CAM explanation.
    5. Fetch disease information and build recommendation.
    6. Persist the prediction to Supabase (honoring the caller's save/history
       preferences — both are opt-OUT flags that default to today's behaviour).
    7. Email a disease alert when the risk is HIGH or CRITICAL (never fatal).
    8. Return the complete structured response.
    """

    # ── 1. Validate upload ────────────────────────────────────────────────────
    # Identity comes from the signature-verified token, never from the client.
    user_id = str(claims["sub"])

    try:
        image_bytes = await validate_upload(file)
    except UnsupportedImageError as exc:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=exc.message,
        )
    except ImageTooLargeError as exc:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=exc.message,
        )
    except InvalidImageError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=exc.message,
        )

    safe_filename = sanitise_filename(file.filename or "upload.jpg")
    image_hash = compute_image_hash(image_bytes)

    # ── 1c. Wheat-leaf content validation ─────────────────────────────────────
    try:
        validate_wheat_leaf_content(image_bytes)
    except NotAWheatLeafError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=exc.message,
        )

    # ── 1b. Upload image to Supabase Storage (non-fatal) ─────────────────────
    # "Keep original images" off (Settings → Prediction) skips the upload
    # entirely; the analysis below runs on the in-memory bytes either way.
    image_url = upload_image(image_bytes, safe_filename) if store_image else None

    # ── 2. Run inference ──────────────────────────────────────────────────────
    try:
        result = model_manager.predict(image_bytes, top_k=top_k)
    except ModelNotLoadedError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=exc.message,
        )
    except InferenceError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=exc.message,
        )
    except InvalidImageError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=exc.message,
        )

    top_predictions = [TopPrediction(**p) for p in result["top_predictions"]]

    # ── 3. Confidence level + severity ───────────────────────────────────────
    conf_level = _confidence_level(result["confidence_percentage"])

    # Fetch disease info early so we can get severity
    raw_info = get_disease_info(result["prediction"])
    severity = raw_info.get("severity", "unknown")

    # ── 4. Grad-CAM ───────────────────────────────────────────────────────────
    gradcam_result: GradCAMResult | None = None
    gradcam_available = False

    if include_gradcam and model_manager.model is not None:
        try:
            class_idx = (
                model_manager.class_names.index(result["prediction"])
                if result["prediction"] in model_manager.class_names
                else None
            )
            cam_images = run_gradcam(
                model=model_manager.model,
                image_bytes=image_bytes,
                class_idx=class_idx,
            )
            gradcam_result = GradCAMResult(**cam_images)
            gradcam_available = True
        except Exception as exc:
            logger.warning("Grad-CAM failed (non-fatal): %s", exc)

    # ── 5. Disease info & recommendation ─────────────────────────────────────
    disease_info = DiseaseInfo(
        display_name=raw_info.get("display_name", result["prediction"]),
        description=raw_info.get("description", ""),
        symptoms=raw_info.get("symptoms", []),
        prevention=raw_info.get("prevention", []),
        management=raw_info.get("management", []),
        severity=severity,
        risk_level=raw_info.get("risk_level", "unknown"),
        disclaimer=raw_info.get(
            "disclaimer",
            "Consult an agricultural expert for confirmation.",
        ),
    )
    recommendation = get_recommendation(
        result["prediction"],
        low_confidence=result["low_confidence"],
    )

    # ── 5b. Generate AI diagnosis report (OpenRouter) ────────────────────────
    # This report comes back from a language model, so both the call and the
    # schema build are guarded: an oddly formatted answer must never cost the
    # farmer a prediction the classifier already completed. The fallback is
    # assembled purely from values this backend produced.
    try:
        ai_report_dict = await generate_diagnosis_report(
            disease=result["prediction"],
            confidence_pct=result["confidence_percentage"],
            disease_info=raw_info,
            recommendation=recommendation,
            severity=severity,
        )
        ai_report = AiDiagnosisReport(**ai_report_dict)
    except Exception as exc:
        logger.warning(
            "AI diagnosis report unavailable for %s, using a server-built one: %s",
            result["prediction"],
            exc,
        )
        ai_report = AiDiagnosisReport(
            disease=disease_info.display_name,
            confidence_pct=max(0, min(100, round(result["confidence_percentage"]))),
            problem=(
                f"Automated screening flagged {disease_info.display_name.lower()} "
                "on this wheat leaf."
            ),
            recommendation=recommendation,
            solution=(
                disease_info.management[0]
                if disease_info.management
                else "Follow the recommended management actions shown above."
            ),
            generated_by="fallback",
        )
        ai_report_dict = ai_report.model_dump()

    # ── 6. Persist to Supabase ────────────────────────────────────────────────
    prediction_id = "unavailable"
    # "Save predictions automatically" off (Settings → Prediction) means the
    # scan is analysed but never stored: prediction_id stays "unavailable", so
    # the result page naturally renders without history-dependent actions
    # (share / PDF / re-report all key off a real id).
    if save_history:
        try:
            record = create_prediction(
                {
                    "filename": safe_filename,
                    "predicted_class": result["prediction"],
                    "confidence": result["confidence"],
                    "confidence_pct": result["confidence_percentage"],
                    "confidence_level": conf_level,
                    "low_confidence": result["low_confidence"],
                    "severity": severity,
                    "top_predictions": result["top_predictions"],
                    "recommendation": recommendation,
                    "inference_time_ms": result["inference_time_ms"],
                    "model_version": result["model_version"],
                    "image_hash": image_hash,
                    "image_url": image_url,
                    "gradcam_available": gradcam_available,
                    "ai_report": ai_report_dict,
                    "user_id": user_id,
                }
            )
            prediction_id = record.id

            # Record the meaningful-activity event so retention analytics can
            # attribute this prediction to the user (best-effort — a tracking
            # failure must never fail the prediction itself).
            record_activity(user_id, "prediction_created", prediction_id=record.id)

            # Fan out an admin-bell notification (who predicted what) — best-effort,
            # never fails the prediction (same policy as the DB write above).
            _notify_admins_of_prediction(
                user_id=user_id,
                claims=claims,
                prediction_id=record.id,
                disease=result["prediction"],
                confidence_pct=result["confidence_percentage"],
                severity=severity,
            )
        except DatabaseError as exc:
            logger.error("Could not persist prediction to database (non-fatal): %s", exc)
    else:
        logger.info("Scan intentionally not saved (save_auto off) for user=%s", user_id)

    # ── 7. High-risk email alert (never fatal — spec §10) ────────────────────
    # Only a severity/risk level of HIGH or CRITICAL qualifies, and only if the
    # user kept "Disease Alert Emails" on. The prediction is already saved at
    # this point, so any email problem is logged and the result is still
    # returned to the farmer.
    email_queued = False
    email_sent = False
    try:
        alert = await maybe_send_disease_alert(
            user_id=user_id,
            claims=claims,
            prediction_id=prediction_id,
            disease_name=disease_info.display_name,
            confidence_pct=result["confidence_percentage"],
            severity=severity,
            risk_level=disease_info.risk_level,
            recommendation=recommendation,
            image_url=image_url,
        )
        email_queued, email_sent = alert.queued, alert.sent
    except Exception as exc:  # defensive: mail must never break a prediction
        logger.error(
            "Disease alert step failed (non-fatal) for prediction=%s: %s",
            prediction_id,
            exc,
        )

    # ── 8. Build & return response ────────────────────────────────────────────
    logger.info(
        "Predict complete: id=%s class=%s severity=%s conf=%.2f%% (%s) low_conf=%s gradcam=%s",
        prediction_id,
        result["prediction"],
        severity,
        result["confidence_percentage"],
        conf_level,
        result["low_confidence"],
        gradcam_available,
    )

    return PredictionResponse(
        prediction_id=prediction_id,
        prediction=result["prediction"],
        confidence=result["confidence"],
        confidence_percentage=result["confidence_percentage"],
        confidence_level=conf_level,
        low_confidence=result["low_confidence"],
        severity=severity,
        top_predictions=top_predictions,
        disease_info=disease_info,
        recommendation=recommendation,
        gradcam=gradcam_result,
        gradcam_available=gradcam_available,
        inference_time_ms=result["inference_time_ms"],
        model_version=result["model_version"],
        image_url=image_url,
        ai_report=ai_report,
        email_queued=email_queued,
        email_sent=email_sent,
    )


@router.post(
    "/predictions/diagnosis-report/{prediction_id}",
    response_model=AiDiagnosisReport,
    summary="Regenerate AI diagnosis report for a history record",
)
async def regenerate_diagnosis_report(
    prediction_id: str = Path(..., description="Prediction UUID"),
    user_id: str = Depends(get_current_user_id),
) -> AiDiagnosisReport:
    """Regenerate and persist the AI report for an existing prediction."""
    try:
        record = get_prediction_by_id(prediction_id, user_id=user_id)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=f"Record not found: {exc}")

    raw_info = get_disease_info(record.predicted_class)
    rec = record.recommendation or get_recommendation(
        record.predicted_class, record.low_confidence
    )
    report_dict = await generate_diagnosis_report(
        disease=record.predicted_class,
        confidence_pct=record.confidence_pct,
        disease_info=raw_info,
        recommendation=rec or "",
        severity=record.severity,
    )
    try:
        update_prediction_ai_report(prediction_id, report_dict)
    except Exception as exc:
        logger.warning("Could not persist regenerated ai_report: %s", exc)

    return AiDiagnosisReport(**report_dict)