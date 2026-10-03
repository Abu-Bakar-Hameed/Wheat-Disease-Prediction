"""
WheatGuard AI – OpenRouter LLM Service

Chat + structured diagnosis reports, served by any OpenRouter model configured in
`.env` (OPENROUTER_MODEL). Talks to OpenRouter's OpenAI-compatible endpoint
`POST {base}/chat/completions` over httpx, which is already a project dependency.

Security: the API key is read from server settings only and is never returned to
the browser. The chatbot calls `/api/v1/assistant/chat`, and this module attaches
the credentials on the server side.

Degradation: when no key is configured, or the upstream call fails, both entry
points fall back to the rule-based knowledge base in `api.routes.assistant`, so
the assistant keeps answering instead of erroring out.
"""

from __future__ import annotations

import json
import re
from typing import Any

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_llm_available: bool | None = None


def is_llm_available() -> bool:
    """Return True when an OpenRouter API key is configured."""
    global _llm_available
    if _llm_available is not None:
        return _llm_available
    _llm_available = bool(settings.openrouter_api_key and settings.openrouter_api_key.strip())
    if not _llm_available:
        logger.warning("OPENROUTER_API_KEY is not set — the assistant will use the rule-based fallback.")
    return _llm_available


def _headers(api_key: str | None = None) -> dict[str, str]:
    # A user's own OpenRouter key (Settings → Chatbot) takes precedence over
    # the server's shared key; when neither is present the caller falls back to
    # the rule-based knowledge base before ever reaching here.
    key = (api_key or settings.openrouter_api_key or "").strip()
    return {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        # Optional but recommended by OpenRouter for app attribution.
        "HTTP-Referer": settings.openrouter_app_url,
        "X-Title": settings.openrouter_app_name,
    }


def _effective_model(model: str | None) -> str:
    """The per-user model id when it is a real value, else the server default."""
    return (model or "").strip() or settings.openrouter_model


async def _chat(
    messages: list[dict[str, str]],
    max_tokens: int,
    temperature: float,
    *,
    api_key: str | None = None,
    model: str | None = None,
) -> str:
    """Send one chat completion request and return the assistant text."""
    payload = {
        "model": _effective_model(model),
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    url = f"{settings.openrouter_base_url.rstrip('/')}/chat/completions"

    async with httpx.AsyncClient(timeout=settings.openrouter_timeout_seconds) as client:
        resp = await client.post(url, headers=_headers(api_key), json=payload)

    if resp.status_code != 200:
        raise RuntimeError(f"OpenRouter {resp.status_code}: {resp.text[:300]}")

    data = resp.json()
    choices = data.get("choices") or []
    if not choices:
        raise RuntimeError(f"OpenRouter returned no choices: {str(data)[:300]}")

    msg = choices[0].get("message") or {}
    # Some models (especially reasoning/alpha ones) answer in a non-standard
    # field; fall through them in a sensible order rather than returning blank.
    text = (
        msg.get("content")
        or msg.get("reasoning")
        or msg.get("text")
        or ""
    )
    return str(text).strip()


def _build_system_prompt(context: dict[str, Any]) -> str:
    """Build a system prompt with WheatGuard project context."""
    parts = [
        "You are WheatGuard AI, an expert agronomist assistant for wheat disease detection.",
        "You help farmers and agronomists with disease identification, treatment, and prevention.",
        "Always be concise, practical, and cite locally approved agricultural guidance when possible.",
        "Format responses with markdown when helpful (bold, bullet lists).",
    ]

    if context.get("last_prediction"):
        pred = context["last_prediction"]
        parts.append(
            f"\nCurrent diagnostic context:\n"
            f"- Disease: {pred.get('prediction', 'Unknown')}\n"
            f"- Confidence: {pred.get('confidence_percentage', 0):.1f}%\n"
            f"- Severity: {pred.get('severity', 'unknown')}\n"
            f"- Recommendation: {pred.get('recommendation', 'N/A')}"
        )

    if context.get("disease"):
        parts.append(f"\nUser is asking about: {context['disease']}")

    return "\n".join(parts)


def _parse_json_from_text(text: str) -> dict[str, Any] | None:
    """Extract a JSON object from model response text."""
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            pass
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass
    return None


def _coerce_pct(value: Any, default: float) -> int:
    """Squeeze an LLM-supplied percentage into an int in 0-100.

    Models return this field as 27, 27.34, "27%" or occasionally something that
    is not a number at all; the response schema expects a plain integer, so a
    raw value used to fail validation and 500 the whole prediction.
    """
    try:
        number = float(str(value).strip().rstrip("%"))
    except (TypeError, ValueError):
        number = float(default)
    return max(0, min(100, round(number)))


def _fallback_diagnosis_report(
    disease: str,
    confidence_pct: float,
    disease_info: dict[str, Any] | None = None,
    recommendation: str = "",
) -> dict[str, Any]:
    """Generate a structured report without any LLM."""
    display = disease.replace("_", " ")
    if disease_info:
        display = disease_info.get("display_name", display)

    symptoms = (disease_info or {}).get("symptoms", [])
    management = (disease_info or {}).get("management", [])

    if "healthy" in disease.lower():
        problem = "The wheat leaves appear healthy with no significant disease symptoms detected."
        rec = "Continue regular field monitoring and maintain good agronomic practices."
        solution = "No treatment required. Follow standard crop management and scouting protocols."
    else:
        symptom_hint = symptoms[0] if symptoms else f"symptoms consistent with {display.lower()}"
        problem = f"The wheat leaves show {symptom_hint}."
        rec = recommendation or "Inspect nearby plants and monitor whether the symptoms are spreading."
        mgmt = management[0] if management else "Follow an appropriate disease-management plan based on locally approved agricultural guidance."
        solution = mgmt

    return {
        "title": "EntryRank Detection",
        "disease": display,
        "confidence_pct": round(confidence_pct),
        "problem": problem,
        "recommendation": rec,
        "solution": solution,
        "generated_by": "fallback",
    }


async def chat_completion(
    messages: list[dict[str, str]],
    context: dict[str, Any] | None = None,
    *,
    api_key: str | None = None,
    model: str | None = None,
) -> tuple[str, float, list[str]]:
    """
    Send a chat completion request to OpenRouter.
    Returns (response_text, confidence, sources). Falls back to the rule-based
    knowledge base (assistant._generate) when no key is set or the call fails.

    A user may bring their own OpenRouter key / pick a model in
    Settings → Chatbot; those override the server defaults for THIS call only.
    When the user has a key, availability is satisfied even if the server has
    none (their key pays for their own usage).
    """
    context = context or {}
    last_user = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")

    user_has_key = bool((api_key or "").strip())
    if not (user_has_key or is_llm_available()):
        from app.api.routes.assistant import _generate  # noqa: PLC0415 – avoid circular import
        return _generate(last_user, context)

    try:
        # System prompt first, then the full conversation in OpenAI roles.
        payload = [{"role": "system", "content": _build_system_prompt(context)}]
        for msg in messages:
            role = "assistant" if msg["role"] == "assistant" else "user"
            content = (msg.get("content") or "").strip()
            if content:
                payload.append({"role": role, "content": content})

        text = await _chat(
            payload, max_tokens=1024, temperature=0.4, api_key=api_key, model=model
        )
        if not text:
            raise RuntimeError("OpenRouter returned an empty response")

        sources = [f"OpenRouter · {_effective_model(model)}", "WheatGuard Disease Knowledge Base"]
        return text, 0.93, sources

    except Exception as exc:
        logger.error("OpenRouter chat failed: %s", exc, exc_info=True)
        from app.api.routes.assistant import _generate  # noqa: PLC0415
        text, conf, sources = _generate(last_user, context)
        sources = ["Fallback Knowledge Base (OpenRouter unavailable)"] + sources
        return text, conf * 0.9, sources


async def generate_diagnosis_report(
    disease: str,
    confidence_pct: float,
    disease_info: dict[str, Any] | None = None,
    recommendation: str = "",
    severity: str = "unknown",
) -> dict[str, Any]:
    """
    Generate a structured EntryRank-style diagnosis report.
    Returns dict with: title, disease, confidence_pct, problem, recommendation, solution.
    """
    if not is_llm_available():
        return _fallback_diagnosis_report(disease, confidence_pct, disease_info, recommendation)

    display = disease.replace("_", " ")
    if disease_info:
        display = disease_info.get("display_name", display)

    symptoms = (disease_info or {}).get("symptoms", [])
    management = (disease_info or {}).get("management", [])

    prompt = f"""You are WheatGuard AI generating a wheat disease diagnosis report.

Based on this AI prediction:
- Disease class: {disease}
- Display name: {display}
- Confidence: {confidence_pct:.1f}%
- Severity: {severity}
- Symptoms: {', '.join(symptoms[:3]) if symptoms else 'N/A'}
- Management options: {', '.join(management[:2]) if management else 'N/A'}
- Base recommendation: {recommendation or 'N/A'}

Return ONLY a JSON object (no markdown fences) with these exact keys:
{{
  "title": "EntryRank Detection",
  "disease": "<human-readable disease name, e.g. Wheat Leaf Rust>",
  "confidence_pct": {round(confidence_pct)},
  "problem": "<1-2 sentences describing the problem/symptoms>",
  "recommendation": "<1-2 sentences with immediate action to take>",
  "solution": "<1-2 sentences with treatment/management solution>"
}}

Keep each field concise (max 2 sentences). Use plain language for farmers."""

    try:
        raw = await _chat(
            [{"role": "user", "content": prompt}],
            max_tokens=700,
            temperature=0.2,
        )
        parsed = _parse_json_from_text(raw or "")
        if parsed and all(k in parsed for k in ("problem", "recommendation", "solution")):
            # Normalise every field the model echoed back rather than trusting
            # its formatting: the numbers must be ints and the text must be
            # strings before the response schema sees them.
            parsed["confidence_pct"] = _coerce_pct(
                parsed.get("confidence_pct"), confidence_pct
            )
            parsed["title"] = str(parsed.get("title") or "EntryRank Detection").strip()
            parsed["disease"] = str(parsed.get("disease") or display).strip()
            for key in ("problem", "recommendation", "solution"):
                parsed[key] = str(parsed.get(key) or "").strip()
            parsed["generated_by"] = "openrouter"
            return parsed
        logger.warning("OpenRouter diagnosis report was not valid JSON; using fallback")
    except Exception as exc:
        logger.warning("OpenRouter diagnosis report failed: %s", exc)

    return _fallback_diagnosis_report(disease, confidence_pct, disease_info, recommendation)
