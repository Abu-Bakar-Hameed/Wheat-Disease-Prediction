"""
WheatGuard AI – Built-in AI Assistant Routes
POST /api/v1/assistant/chat     → OpenRouter-powered agronomic chat (single built-in assistant)
GET  /api/v1/assistant/suggested → suggested prompt chips

The OpenRouter API key lives only on the server (settings.openrouter_api_key);
it is never exposed to the browser. Conversation history is held client-side
only — nothing is persisted here.

Feature availability is enforced server-side from the authenticated user's
`user_settings` row so a client cannot bypass a disabled toggle by crafting
requests directly (spec §17/§26).
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.auth import get_current_user_id
from app.core.config import settings
from app.core.logging import get_logger
from app.database.database import get_supabase_client
from app.ml.openrouter_service import chat_completion, is_llm_available

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v1/assistant", tags=["AI Assistant"])

_SETTINGS_TABLE = "user_settings"

# Prediction-related context keys that must be withheld when the user has
# disabled the "Recent Predictions" chatbot feature.
_PREDICTION_CONTEXT_KEYS = ("last_prediction", "ai_report", "prediction", "predictions", "recent_predictions")


# ── Schemas ───────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str = Field(..., description="'user' or 'assistant'")
    content: str = ""
    image: str | None = Field(default=None, description="Optional base64/URL image attached by the user")
    attachments: List[Any] = Field(default_factory=list)
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    context: Dict[str, Any] = Field(default_factory=dict)


class ChatResponse(BaseModel):
    message: ChatMessage
    confidence: float = Field(..., ge=0.0, le=1.0)
    sources: List[str] = Field(default_factory=list)
    llm_enabled: bool = False


# ── Settings helpers ────────────────────────────────────────────────────────

def _get_user_chat_settings(user_id: str) -> Dict[str, Any]:
    """Read the caller's chat feature flags plus their optional own OpenRouter
    key and model choice. Booleans default to enabled; the key/model default to
    None (fall back to the server's shared credentials in openrouter_service)."""
    defaults: Dict[str, Any] = {
        "image_upload_enabled": True,
        "recent_predictions_enabled": True,
        "chat_notifications_enabled": True,
        "voice_enabled": True,
        "openrouter_api_key": None,
        "chat_model": None,
    }
    try:
        client = get_supabase_client()
        resp = (
            client.table(_SETTINGS_TABLE)
            .select(
                "image_upload_enabled,recent_predictions_enabled,"
                "chat_notifications_enabled,voice_enabled,"
                "openrouter_api_key,chat_model"
            )
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        row = resp.data or {}
        for k in (
            "image_upload_enabled", "recent_predictions_enabled",
            "chat_notifications_enabled", "voice_enabled",
        ):
            if isinstance(row.get(k), bool):
                defaults[k] = row[k]
        key = row.get("openrouter_api_key")
        if isinstance(key, str) and key.strip():
            defaults["openrouter_api_key"] = key.strip()
        model = row.get("chat_model")
        if isinstance(model, str) and model.strip():
            defaults["chat_model"] = model.strip()
    except Exception as exc:  # table/columns may not exist yet → fail open
        logger.warning("Could not read chat settings for user=%s: %s", user_id, exc)
    return defaults


def _message_has_image(msg: ChatMessage) -> bool:
    if msg.image and msg.image.strip():
        return True
    return bool(msg.attachments)


_MD_MARKERS = re.compile(r"\*\*|\*|__|_|`|#")


def _plain_snippet(text: str, limit: int = 110) -> str:
    """Collapse an assistant reply into a bell-friendly one-liner.

    The model answers in Markdown, so the raw text arrives full of `**bold**`
    and `_italic_` markers while the notification dropdown renders plain text.
    Emphasis markers are dropped rather than swapped for a space, and the
    result is re-joined on whitespace so punctuation stays normal.
    """
    plain = " ".join(_MD_MARKERS.sub("", text).split())
    if len(plain) <= limit:
        return plain
    cut = plain[:limit]
    space = cut.rfind(" ")
    if space > 0:
        cut = cut[:space]
    return cut.rstrip(" ,;:.-") + "…"


def _notify_assistant_reply(user_id: str, question: str, answer: str) -> None:
    """Record an in-app bell notification once the assistant has replied.

    Gated by the caller's `chat_notifications_enabled` toggle (Settings → Chatbot
    → Notifications). Notes on the row shape:

    * `notifications.type` has a fixed CHECK constraint list that contains no
      chat/assistant value, so this reuses 'system' and carries the specifics in
      `metadata` instead of failing the insert on an unknown type.
    * `id`, `created_at` and `updated_at` are left to their DB defaults. Never
      send the SQL literal "now()" as a value — PostgREST tries to cast the JSON
      string to timestamptz and rejects the entire row.

    Best-effort by design: a notification failure must never break the chat
    response the user is waiting on.
    """
    snippet = _plain_snippet(answer)

    try:
        client = get_supabase_client()
        client.table("notifications").insert(
            {
                "user_id": user_id,
                "title": "Assistant replied",
                "message": snippet or "Your assistant response is ready.",
                "type": "system",
                "category": "general",
                "priority": "low",
                "action_url": "/dashboard/assistant",
                "metadata": {
                    "source": "assistant",
                    "model": settings.openrouter_model,
                    "question": " ".join(question.split())[:120],
                },
            }
        ).execute()
    except Exception as exc:
        logger.warning("Could not record assistant notification for user=%s: %s", user_id, exc)


# ── Knowledge base (fallback when no LLM is configured) ─────────────────────────

_KB: Dict[str, Dict[str, str]] = {
    "yellow rust": {
        "sci": "Puccinia striiformis",
        "symptoms": "Bright yellow-orange pustules in linear stripes parallel to leaf veins.",
        "conditions": "Optimal at 10–25°C with >70% humidity and extended leaf wetness.",
        "treatment": "Triazole (Tebuconazole, Propiconazole) or Triazole + Strobilurin premix. Provides 14–21 days protection.",
        "prevention": "Resistant varieties, early planting, balanced nitrogen fertilisation.",
    },
    "brown rust": {
        "sci": "Puccinia triticina",
        "symptoms": "Scattered reddish-brown circular to oval pustules on upper leaf surface.",
        "conditions": "Favoured by 15–22°C, >60% humidity.",
        "treatment": "Strobilurins (Azoxystrobin, Pyraclostrobin) or Triazoles at first sign.",
        "prevention": "Crop rotation, resistant cultivars, remove volunteer wheat.",
    },
    "powdery mildew": {
        "sci": "Blumeria graminis",
        "symptoms": "White-to-grey cottony fungal patches on leaves and stems.",
        "conditions": "15–22°C, moderate humidity (50–70%), dense canopy.",
        "treatment": "Sulfur-based, DMI or Strobilurin fungicides. Reduce nitrogen input.",
        "prevention": "Adequate spacing, avoid excess nitrogen, use resistant varieties.",
    },
    "septoria": {
        "sci": "Zymoseptoria tritici",
        "symptoms": "Irregular brown necrotic lesions with black pycnidia (fruiting bodies).",
        "conditions": "Extended leaf wetness ≥48 h, 15–25°C.",
        "treatment": "Multi-site (Chlorothalonil) + systemic Triazoles. Apply preventively.",
        "prevention": "Plough under crop residue, rotate crops, use fungicide-coated seed.",
    },
}


def _generate(text: str, context: Dict[str, Any]) -> tuple[str, float, List[str]]:
    """Rule-based response generator — used as fallback when no LLM is available."""
    q = text.lower()

    for kw, info in [
        (["yellow rust", "stripe rust", "puccinia striiformis"], "yellow rust"),
        (["brown rust", "leaf rust", "puccinia triticina"],       "brown rust"),
        (["powdery mildew", "blumeria"],                          "powdery mildew"),
        (["septoria", "zymoseptoria"],                            "septoria"),
    ]:
        if any(k in q for k in kw):
            d = _KB[info]
            return (
                f"**{info.title()}** ({d['sci']})\n\n"
                f"**Symptoms:** {d['symptoms']}\n\n"
                f"**Conditions:** {d['conditions']}\n\n"
                f"**Treatment:** {d['treatment']}\n\n"
                f"**Prevention:** {d['prevention']}",
                0.92,
                [f"Disease Knowledge Base – {d['sci']}"],
            )

    if "triazole" in q and "strobilurin" in q:
        return (
            "**Triazoles (DMI):** Inhibit ergosterol biosynthesis. "
            "Curative activity 3–5 days post-infection (Tebuconazole, Propiconazole).\n\n"
            "**Strobilurins (QoI):** Block mitochondrial respiration. "
            "Primarily preventive (Azoxystrobin, Pyraclostrobin).\n\n"
            "**Best practice:** Use premix products to combine both modes of action "
            "and rotate chemistries each season to manage resistance.",
            0.95,
            ["Fungicide Mode of Action Guide", "FRAC Resistance Management 2025"],
        )

    if "phi" in q or "pre-harvest" in q:
        return (
            "Pre-Harvest Intervals (PHI) vary by country and product label:\n\n"
            "• **Tebuconazole** — typically 35 days (EU), verify local label\n"
            "• **Azoxystrobin** — typically 14–21 days\n"
            "• **Propiconazole** — typically 40 days\n\n"
            "Always confirm with the specific product's registered label in your region.",
            0.88,
            ["EFSA Pesticide PHI Database", "EPA Label Repository"],
        )

    if "tank" in q and ("mix" in q or "zinc" in q):
        return (
            "Tank-mixing Azoxystrobin with foliar zinc:\n\n"
            "1. Perform a jar compatibility test before mixing.\n"
            "2. Maintain spray water pH 6.0–6.8 to prevent alkaline hydrolysis.\n"
            "3. Add zinc formulation first; dissolve fully before adding the SC fungicide.\n"
            "4. Check for precipitate or phase separation before spraying.",
            0.90,
            ["AHDB Tank Mix Guidance", "Adjuvant Compatibility Reference"],
        )

    if "scout" in q or "monitor" in q:
        return (
            "**Scouting Protocol:**\n\n"
            "• Walk a W or X pattern across the field\n"
            "• Examine 5–10 plants per stop, 5–7 stops minimum\n"
            "• Inspect flag leaf, flag-1, flag-2 on both surfaces\n\n"
            "**Action thresholds:**\n"
            "• Yellow Rust: ≥1% severity at stem extension\n"
            "• Brown Rust: ≥5% flag leaf severity\n"
            "• Septoria: ≥5% on leaf-2 at flag leaf emergence",
            0.91,
            ["IPM Scouting Protocol", "AHDB Economic Thresholds"],
        )

    if "overwinter" in q or "volunteer" in q:
        return (
            "Yes – Yellow Rust (Puccinia striiformis) can overwinter as urediniospores "
            "on volunteer wheat and early-sown crops in mild climates (above ~2°C). "
            "Removing volunteer wheat and late-season green bridges significantly "
            "reduces primary inoculum for the following season.",
            0.87,
            ["Plant Pathology – Stripe Rust Epidemiology"],
        )

    return (
        "I can help with disease identification, fungicide recommendations, "
        "scouting protocols, tank-mixing, and resistance management. "
        "Please describe the symptoms you are observing, the crop growth stage, "
        "and recent weather conditions for a more specific answer.",
        0.70,
        ["General Agronomy Knowledge Base"],
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post(
    "/chat",
    response_model=ChatResponse,
    summary="Agronomic AI chat (OpenRouter)",
    description=(
        "Submit a conversation and receive an expert agronomic response powered by "
        "the configured OpenRouter model. Falls back to the rule-based knowledge base "
        "when OPENROUTER_API_KEY is not configured or the upstream call fails. "
        "Enforces the caller's chatbot feature settings."
    ),
)
async def chat(
    request: ChatRequest,
    user_id: str = Depends(get_current_user_id),
) -> ChatResponse:
    if not request.messages:
        raise HTTPException(status_code=400, detail="messages must not be empty")

    last = next((m for m in reversed(request.messages) if m.role == "user"), None)
    if not last:
        raise HTTPException(status_code=400, detail="No user message found in messages")

    # Renamed from `settings` so it cannot shadow the app config module import.
    chat_flags = _get_user_chat_settings(user_id)

    # Image upload disabled → reject any message carrying an image/attachment.
    if not chat_flags["image_upload_enabled"] and any(_message_has_image(m) for m in request.messages):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "feature_disabled", "feature": "image_upload"},
        )

    context = dict(request.context or {})
    # Recent predictions disabled → strip prediction context before prompting.
    if not chat_flags["recent_predictions_enabled"]:
        for key in _PREDICTION_CONTEXT_KEYS:
            context.pop(key, None)

    try:
        msg_list = [
            {"role": m.role, "content": m.content}
            for m in request.messages
        ]
        # A user's own OpenRouter key / model (Settings → Chatbot) overrides the
        # server defaults for this call only; both are None when unset.
        text, conf, sources = await chat_completion(
            msg_list,
            context,
            api_key=chat_flags.get("openrouter_api_key"),
            model=chat_flags.get("chat_model"),
        )
    except Exception as exc:
        logger.error("Assistant generate error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to generate response")

    # Reply is ready → ping the bell, honouring the assistant-notifications toggle.
    if chat_flags["chat_notifications_enabled"]:
        _notify_assistant_reply(user_id, last.content, text)

    return ChatResponse(
        message=ChatMessage(role="assistant", content=text, timestamp=datetime.utcnow()),
        confidence=conf,
        sources=sources,
        llm_enabled=bool(chat_flags.get("openrouter_api_key")) or is_llm_available(),
    )


@router.get(
    "/suggested",
    response_model=List[str],
    summary="Suggested prompt chips",
)
async def suggested_questions() -> List[str]:
    return [
        "What are the optimal conditions for Yellow Rust infection?",
        "Compare Triazole vs Strobilurin fungicides",
        "How to distinguish between different rust types?",
        "Best practices for wheat disease scouting",
        "What is the pre-harvest interval (PHI) for Tebuconazole?",
        "Can Yellow Rust overwinter in volunteer wheat?",
        "Optimal tank-mix: Azoxystrobin + foliar zinc",
        "How do I manage fungicide resistance?",
        "Explain my latest wheat disease scan results",
        "What treatment should I apply for leaf rust at 94% confidence?",
    ]
