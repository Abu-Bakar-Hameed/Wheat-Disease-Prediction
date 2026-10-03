
# admin_crud.py

"""
WheatGuard AI – Admin CRUD
Users, diseases, information gallery, settings, and audit logs.

Uses Supabase tables when available and falls back to in-memory stores so the
admin panel still works before schema.sql has been applied.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from app.core.logging import get_logger
from app.database.database import get_supabase_client
from app.database.storage import delete_file_from_storage, upload_image, upload_video
from app.ml.disease_service import get_all_diseases

logger = get_logger(__name__)

_TABLE_OK: dict[str, bool] = {}

_MEM_USERS: list[dict[str, Any]] = [
    {
        "id": "u-admin",
        "auth_user_id": None,
        "name": "John Doe",
        "email": "admin@wheatguard.ai",
        "role": "admin",
        "status": "active",
        "created_at": datetime.now(timezone.utc).isoformat(),
    },
    {
        "id": "u-farmer",
        "auth_user_id": None,
        "name": "Ayesha Khan",
        "email": "ayesha@farm.pk",
        "role": "user",
        "status": "active",
        "created_at": datetime.now(timezone.utc).isoformat(),
    },
    {
        "id": "u-research",
        "auth_user_id": None,
        "name": "Dr. Sara Rostova",
        "email": "sara@agrilab.org",
        "role": "researcher",
        "status": "inactive",
        "created_at": datetime.now(timezone.utc).isoformat(),
    },
]
_MEM_DISEASES: list[dict[str, Any]] = []
_MEM_GALLERY: list[dict[str, Any]] = []
_MEM_SETTINGS: dict[str, Any] = {
    "id": "default",
    "site_title": "Plant Disease Recognition System",
    "support_email": "support@wheatguard.ai",
    "language": "English",
    "email_notifications": True,
    "push_notifications": False,
    "system_alerts": True,
    "description": "Admin console for crop registry, user access, and disease diagnosis.",
    "username": "Admin",
    "admin_email": "admin@wheatguard.ai",
    "updated_at": datetime.now(timezone.utc).isoformat(),
}
_MEM_AUDIT: list[dict[str, Any]] = []
_MEM_CROPS: list[dict[str, Any]] = []
_DISEASES_SEEDED = False
_CROPS_SEEDED = False


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
        logger.warning("Admin table '%s' unavailable – using in-memory store", name)
    return _TABLE_OK[name]


def add_audit(
    message: str,
    level: str = "INFO",
    actor: str | None = None,
    event_type: str | None = None,
    status: str = "Success",
    details: dict[str, Any] | None = None,
    image_url: str | None = None,
) -> None:
    derived_event = event_type or (message.split(" - ", 1)[0] if " - " in message else message)
    row = {
        "id": str(uuid.uuid4()),
        "timestamp": _now(),
        "level": level,
        "message": message,
        "actor": actor,
        "event_type": derived_event,
        "status": status if status else ("Failure" if level == "ALERT" else "Success"),
        "details": details or {},
        "image_url": image_url,
    }
    _MEM_AUDIT.insert(0, row)
    if not _table_ok("audit_logs"):
        return
    try:
        payload = {k: v for k, v in row.items() if k != "details"}
        payload["details"] = row["details"]
        _client().table("audit_logs").insert(payload).execute()
    except Exception as exc:
        try:
            slim = {k: row[k] for k in ("id", "timestamp", "level", "message", "actor") if k in row}
            _client().table("audit_logs").insert(slim).execute()
        except Exception:
            logger.warning("audit insert failed: %s", exc)


def list_audit(limit: int = 50) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if _table_ok("audit_logs"):
        try:
            resp = (
                _client()
                .table("audit_logs")
                .select("*")
                .order("timestamp", desc=True)
                .limit(limit)
                .execute()
            )
            rows = resp.data or []
        except Exception as exc:
            logger.warning("list_audit failed: %s", exc)
    if not rows:
        rows = _MEM_AUDIT[:limit]
    normalised: list[dict[str, Any]] = []
    for r in rows:
        msg = str(r.get("message") or "")
        event = r.get("event_type") or (msg.split(" - ", 1)[0] if " - " in msg else "Event")
        level = str(r.get("level") or "INFO")
        normalised.append(
            {
                "id": str(r.get("id") or uuid.uuid4()),
                "timestamp": str(r.get("timestamp") or _now()),
                "level": level,
                "message": msg,
                "actor": r.get("actor"),
                "event_type": event,
                "status": r.get("status") or ("Failure" if level == "ALERT" else "Success"),
                "details": r.get("details") if isinstance(r.get("details"), dict) else {},
                "image_url": r.get("image_url"),
            }
        )
    return normalised


# ── Users ─────────────────────────────────────────────────────────────────────
#
# The Node/Express auth backend (auth.controller.js) is the real signup/login
# flow. On register (and on first OAuth sign-in) it does two things against
# the SAME Supabase project this backend talks to:
#   1. supabaseAdmin.auth.admin.createUser(...)  -> a Supabase Auth user
#   2. supabaseAdmin.from("profiles").insert(...) -> a row in "profiles",
#      keyed by the SAME id as the auth user, shaped like:
#        { id, name, organization_name, email, role, email_verified }
#
# "profiles" is therefore the authoritative source for real users' name /
# organization / role. Supabase Auth is used only to enrich that with
# banned/active status and the account creation timestamp. There is no
# separate "app_users" table in the real schema - that name was a mistake
# that made this panel read from a table the Node backend never writes to.


def _user_from_auth_only(u: Any) -> dict[str, Any]:
    """Build a row for an Auth user that has no matching profiles row yet
    (e.g. legacy accounts created before the profiles table existed)."""
    meta = getattr(u, "user_metadata", None) or {}
    if not isinstance(meta, dict):
        meta = {}
    email = getattr(u, "email", None) or meta.get("email") or ""
    name = meta.get("name") or meta.get("full_name") or (email.split("@")[0] if email else "User")
    banned = bool(getattr(u, "banned_until", None))
    role = str(meta.get("role") or "user").lower()
    created = getattr(u, "created_at", None)
    return {
        "id": str(getattr(u, "id", uuid.uuid4())),
        "auth_user_id": str(getattr(u, "id", "")),
        "name": name,
        "email": email,
        "role": role if role in ("admin", "user", "researcher") else "user",
        "organization": "",
        "status": "inactive" if banned else "active",
        "created_at": str(created) if created else _now(),
    }


def _profile_to_row(p: dict[str, Any], auth_by_id: dict[str, Any]) -> dict[str, Any]:
    uid = str(p.get("id") or "")
    au = auth_by_id.get(uid)
    banned = bool(getattr(au, "banned_until", None)) if au else False
    created = getattr(au, "created_at", None) if au else p.get("created_at")
    email = (p.get("email") or "").strip().lower()
    role = str(p.get("role") or "user").lower()
    if banned:
        status = "inactive"
    elif p.get("email_verified"):
        status = "active"
    else:
        status = "pending"
    return {
        "id": uid,
        "auth_user_id": uid,
        "name": p.get("name") or (email.split("@")[0] if email else "User"),
        "email": email,
        "role": role if role in ("admin", "user", "researcher") else "user",
        "organization": p.get("organization_name") or "",
        "status": status,
        "created_at": str(created) if created else _now(),
        # avatar_url lives in profiles.avatar_url (added via migration) or
        # falls back to None — no extra query needed.
        "avatar_url": p.get("avatar_url") or None,
    }


def list_users(search: str = "", page: int = 1, limit: int = 10) -> tuple[list[dict[str, Any]], int]:
    # 1. Pull Auth users so we can enrich profiles with status/created_at, and
    #    so a stray Auth user with no profile row still shows up.
    auth_by_id: dict[str, Any] = {}
    try:
        auth_list = _client().auth.admin.list_users()
        users = getattr(auth_list, "users", auth_list) or []
        auth_by_id = {str(getattr(u, "id", "")): u for u in users}
    except Exception as exc:
        logger.info("Auth admin list_users unavailable: %s", exc)

    rows: dict[str, dict[str, Any]] = {}

    # 2. Real signups: the "profiles" table, matching what auth.controller.js
    #    actually writes. Falls back to demo data only if that table can't
    #    be reached at all (e.g. schema.sql not applied yet).
    if _table_ok("profiles"):
        try:
            resp = _client().table("profiles").select("*").execute()
            for p in resp.data or []:
                row = _profile_to_row(p, auth_by_id)
                rows[row["id"]] = row
        except Exception as exc:
            logger.warning("profiles list failed: %s", exc)
    else:
        for r in _MEM_USERS:
            rows[r["id"]] = {**r, "organization": r.get("organization", "")}

    # 3. Any Auth user without a matching profiles row (legacy accounts).
    for uid, u in auth_by_id.items():
        if uid and uid not in rows:
            rows[uid] = _user_from_auth_only(u)

    result = list(rows.values())
    result.sort(key=lambda r: r.get("created_at") or "", reverse=True)

    q = search.strip().lower()
    if q:
        result = [
            r
            for r in result
            if q in (r.get("name") or "").lower()
            or q in (r.get("email") or "").lower()
            or q in (r.get("role") or "").lower()
        ]
    total = len(result)
    start = (page - 1) * limit
    page_rows = result[start : start + limit]

    return page_rows, total


def create_user(payload: dict[str, Any]) -> dict[str, Any]:
    email = (payload.get("email") or "").strip().lower()
    name = (payload.get("name") or email.split("@")[0]).strip()
    role = (payload.get("role") or "user").strip().lower()
    status = (payload.get("status") or "active").strip().lower()
    password = payload.get("password") or "WheatGuard123!"
    row = {
        "id": str(uuid.uuid4()),
        "auth_user_id": None,
        "name": name,
        "email": email,
        "role": role,
        "organization": "",
        "status": status,
        "created_at": _now(),
    }
    uid = ""
    try:
        created = _client().auth.admin.create_user(
            {
                "email": email,
                "password": password,
                "email_confirm": status == "active",
                "user_metadata": {"name": name, "role": role},
            }
        )
        user = getattr(created, "user", created)
        uid = str(getattr(user, "id", ""))
        if uid:
            row["id"] = uid
            row["auth_user_id"] = uid
    except Exception as exc:
        logger.warning("Auth create_user failed (saving locally): %s", exc)

    if uid and _table_ok("profiles"):
        try:
            _client().table("profiles").insert(
                {
                    "id": uid,
                    "name": name,
                    "organization_name": "",
                    "email": email,
                    "role": role,
                    "email_verified": status == "active",
                }
            ).execute()
        except Exception as exc:
            logger.warning("profiles insert failed: %s", exc)
    else:
        _MEM_USERS.insert(0, row)

    add_audit(f"USER_CREATED - {email} ({role})", actor=email)
    return row


def update_user(user_id: str, payload: dict[str, Any]) -> dict[str, Any] | None:
    patch = {k: v for k, v in payload.items() if k in ("name", "email", "role", "status") and v is not None}
    if "email" in patch:
        patch["email"] = str(patch["email"]).strip().lower()
    current = None
    rows, _ = list_users(limit=500)
    for r in rows:
        if str(r.get("id")) == user_id or str(r.get("auth_user_id")) == user_id:
            current = {**r, **patch}
            break
    if current is None:
        return None

    auth_id = current.get("auth_user_id") or (user_id if len(user_id) > 20 else None)
    if auth_id:
        try:
            auth_update: dict[str, Any] = {"user_metadata": {"name": current["name"], "role": current["role"]}}
            if "email" in patch:
                auth_update["email"] = current["email"]
            if "status" in patch:
                # profiles has no "status" column - map it onto Auth's ban
                # state, which is what _profile_to_row() reads it back from.
                auth_update["ban_duration"] = "none" if current["status"] == "active" else "876000h"
            _client().auth.admin.update_user_by_id(auth_id, auth_update)
        except Exception as exc:
            logger.warning("Auth update_user failed: %s", exc)

    profile_patch = {k: v for k, v in patch.items() if k in ("name", "email", "role")}
    if "status" in patch:
        profile_patch["email_verified"] = patch["status"] == "active"

    if profile_patch and _table_ok("profiles"):
        try:
            _client().table("profiles").update(profile_patch).eq("id", user_id).execute()
        except Exception as exc:
            logger.warning("profiles update failed: %s", exc)
    elif not _table_ok("profiles"):
        for i, r in enumerate(_MEM_USERS):
            if r["id"] == user_id:
                _MEM_USERS[i] = current
                break

    add_audit(f"USER_UPDATED - {current.get('email')}", actor=current.get("email"))
    return current


def delete_user(user_id: str) -> bool:
    rows, _ = list_users(limit=500)
    target = next((r for r in rows if str(r.get("id")) == user_id or str(r.get("auth_user_id")) == user_id), None)
    auth_id = (target or {}).get("auth_user_id") or user_id
    try:
        _client().auth.admin.delete_user(auth_id)
    except Exception as exc:
        logger.warning("Auth delete_user failed: %s", exc)
    if _table_ok("profiles"):
        try:
            _client().table("profiles").delete().eq("id", user_id).execute()
        except Exception as exc:
            logger.warning("profiles delete failed: %s", exc)
    global _MEM_USERS
    _MEM_USERS = [r for r in _MEM_USERS if r["id"] != user_id]
    add_audit(f"USER_DELETED - {user_id}", level="ALERT")
    return True


# ── Diseases ──────────────────────────────────────────────────────────────────

def _join_list(value: Any) -> str:
    if isinstance(value, list):
        return "\n".join(str(x) for x in value)
    return str(value or "")


DEFAULT_DISEASE_IMAGES: dict[str, str] = {
    "Healthy": "https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&q=80&w=800",
    "Leaf_Rust": "https://images.unsplash.com/photo-1595246140625-573b715d11dc?auto=format&fit=crop&q=80&w=800",
    "Yellow_Rust": "https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&q=80&w=800",
    "Stem_Rust": "https://images.unsplash.com/photo-1595246140625-573b715d11dc?auto=format&fit=crop&q=80&w=800",
    "Powdery_Mildew": "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&q=80&w=800",
    "Septoria_Leaf_Blotch": "https://images.unsplash.com/photo-1530595467537-0b5996c41f2d?auto=format&fit=crop&q=80&w=800",
    "Fusarium_Head_Blight": "https://images.unsplash.com/photo-1530595467537-0b5996c41f2d?auto=format&fit=crop&q=80&w=800",
    "Tan_Spot": "https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&q=80&w=800",
}


def _seed_diseases() -> None:
    global _DISEASES_SEEDED
    if _DISEASES_SEEDED:
        return
    _DISEASES_SEEDED = True
    # Start completely fresh with zero default diseases


def list_diseases(search: str = "") -> list[dict[str, Any]]:
    _seed_diseases()
    rows: list[dict[str, Any]] = []
    if _table_ok("diseases"):
        try:
            resp = _client().table("diseases").select("*").order("display_name").execute()
            rows = resp.data or []
        except Exception as exc:
            logger.warning("list_diseases failed: %s", exc)

    # Merge Supabase rows and in-memory store so memory overrides/supplements
    rows_by_id = {str(r.get("id")): dict(r) for r in rows}
    for m in _MEM_DISEASES:
        mid = str(m.get("id"))
        if mid in rows_by_id:
            rows_by_id[mid].update(m)
        else:
            rows_by_id[mid] = dict(m)
    rows = list(rows_by_id.values())

    q = search.strip().lower()
    if q:
        rows = [
            r
            for r in rows
            if q in (r.get("name") or "").lower()
            or q in (r.get("display_name") or "").lower()
            or q in (r.get("category") or "").lower()
            or q in (r.get("description") or "").lower()
        ]
    return rows


def create_disease(
    payload: dict[str, Any],
    image_bytes: bytes | None = None,
    image_filename: str | None = None,
    video_bytes: bytes | None = None,
    video_filename: str | None = None,
) -> dict[str, Any]:
    _seed_diseases()
    image_url = None
    video_url = None
    if image_bytes and image_filename:
        image_url = upload_image(image_bytes, f"disease-{uuid.uuid4().hex[:8]}-{image_filename}")
    if video_bytes and video_filename:
        video_url = upload_video(video_bytes, f"disease-{uuid.uuid4().hex[:8]}-{video_filename}")

    row = {
        "id": str(uuid.uuid4()),
        "name": (payload.get("name") or payload.get("display_name") or "unnamed").replace(" ", "_"),
        "display_name": payload.get("display_name") or payload.get("name") or "Unnamed",
        "category": payload.get("category") or "Fungal",
        "description": payload.get("description") or "",
        "symptoms": payload.get("symptoms") or "",
        "solution": payload.get("solution") or "",
        "recommendation": payload.get("recommendation") or "",
        "prevention": payload.get("prevention") or "",
        "management": payload.get("management") or "",
        "image_url": image_url,
        "video_url": video_url,
        "status": payload.get("status") or "active",
        "created_at": _now(),
        "updated_at": _now(),
    }
    if _table_ok("diseases"):
        try:
            resp = _client().table("diseases").insert(row).execute()
            if resp.data:
                row.update(resp.data[0])
        except Exception as exc:
            logger.warning("create_disease full insert failed: %s; retrying with base columns", exc)
            # Try inserting base columns in case extended columns don't exist yet in remote schema
            base_cols = {"id", "name", "display_name", "category", "description", "status", "image_url", "created_at", "updated_at"}
            base_row = {k: v for k, v in row.items() if k in base_cols}
            try:
                resp = _client().table("diseases").insert(base_row).execute()
                if resp.data:
                    row.update(resp.data[0])
            except Exception as exc2:
                logger.warning("create_disease base insert also failed: %s", exc2)

    # Always keep in memory store synchronized
    _MEM_DISEASES.insert(0, row)
    add_audit(f"DISEASE_CREATED - {row['display_name']}")
    return row


def update_disease(
    disease_id: str,
    payload: dict[str, Any],
    image_bytes: bytes | None = None,
    image_filename: str | None = None,
    video_bytes: bytes | None = None,
    video_filename: str | None = None,
    remove_image: bool = False,
    remove_video: bool = False,
) -> dict[str, Any] | None:
    rows = list_diseases()
    target_id = str(disease_id).strip().lower()

    current = None
    if target_id and target_id != "undefined" and target_id != "null":
        current = next(
            (
                r for r in rows
                if str(r.get("id", "")).strip().lower() == target_id
                or str(r.get("name", "")).strip().lower() == target_id
                or str(r.get("display_name", "")).strip().lower() == target_id
                or str(r.get("name", "")).strip().lower().replace("_", " ") == target_id.replace("_", " ")
                or str(r.get("display_name", "")).strip().lower().replace("_", " ") == target_id.replace("_", " ")
            ),
            None,
        )

    # Fallback to payload identifiers if ID didn't match
    if current is None and payload.get("name"):
        pname = str(payload.get("name", "")).strip().lower()
        current = next(
            (
                r for r in rows
                if str(r.get("name", "")).strip().lower() == pname
                or str(r.get("display_name", "")).strip().lower() == pname
                or str(r.get("name", "")).strip().lower().replace("_", " ") == pname.replace("_", " ")
            ),
            None,
        )

    if current is None and payload.get("display_name"):
        pdisp = str(payload.get("display_name", "")).strip().lower()
        current = next(
            (
                r for r in rows
                if str(r.get("display_name", "")).strip().lower() == pdisp
                or str(r.get("name", "")).strip().lower() == pdisp
                or str(r.get("display_name", "")).strip().lower().replace("_", " ") == pdisp.replace("_", " ")
            ),
            None,
        )

    if current is None:
        return None

    real_id = current.get("id") or disease_id
    patch = {k: v for k, v in payload.items() if v is not None}

    if image_bytes and image_filename:
        if current.get("image_url"):
            delete_file_from_storage(current["image_url"])
        patch["image_url"] = upload_image(image_bytes, f"disease-{uuid.uuid4().hex[:8]}-{image_filename}")
    elif remove_image:
        if current.get("image_url"):
            delete_file_from_storage(current["image_url"])
        patch["image_url"] = None

    if video_bytes and video_filename:
        if current.get("video_url"):
            delete_file_from_storage(current["video_url"])
        patch["video_url"] = upload_video(video_bytes, f"disease-{uuid.uuid4().hex[:8]}-{video_filename}")
    elif remove_video:
        if current.get("video_url"):
            delete_file_from_storage(current["video_url"])
        patch["video_url"] = None

    patch["updated_at"] = _now()
    updated = {**current, **patch}

    if _table_ok("diseases"):
        try:
            resp = _client().table("diseases").update(patch).eq("id", real_id).execute()
            if resp.data:
                updated.update(resp.data[0])
        except Exception as exc:
            logger.warning("update_disease full update failed: %s; retrying with base columns", exc)
            base_cols = {"name", "display_name", "category", "description", "status", "image_url", "updated_at"}
            base_patch = {k: v for k, v in patch.items() if k in base_cols}
            try:
                resp = _client().table("diseases").update(base_patch).eq("id", real_id).execute()
                if resp.data:
                    updated.update(resp.data[0])
            except Exception as exc2:
                logger.warning("update_disease base update also failed: %s", exc2)

    # Always update in-memory store so changes like status toggle take effect immediately
    matched = False
    for i, r in enumerate(_MEM_DISEASES):
        if str(r.get("id")) == str(real_id) or str(r.get("name", "")).lower() == str(current.get("name", "")).lower():
            _MEM_DISEASES[i] = updated
            matched = True
            break
    if not matched:
        _MEM_DISEASES.append(updated)

    add_audit(f"DISEASE_UPDATED - {updated.get('display_name')}")
    return updated


def delete_disease(disease_id: str) -> bool:
    rows = list_diseases()
    target_id = str(disease_id).strip().lower()
    target = next(
        (
            r for r in rows
            if str(r.get("id", "")).strip().lower() == target_id
            or str(r.get("name", "")).strip().lower() == target_id
            or str(r.get("display_name", "")).strip().lower() == target_id
            or str(r.get("name", "")).strip().lower().replace("_", " ") == target_id.replace("_", " ")
        ),
        None,
    )
    if target:
        real_id = target.get("id") or disease_id
        if target.get("image_url"):
            delete_file_from_storage(target["image_url"])
        if target.get("video_url"):
            delete_file_from_storage(target["video_url"])

        if _table_ok("diseases"):
            try:
                _client().table("diseases").delete().eq("id", real_id).execute()
            except Exception as exc:
                logger.warning("delete_disease failed: %s", exc)
        global _MEM_DISEASES
        _MEM_DISEASES = [
            r for r in _MEM_DISEASES
            if str(r.get("id")) != str(real_id) and str(r.get("name", "")).lower() != target_id
        ]
        add_audit(f"DISEASE_DELETED - {disease_id}", level="ALERT")
        return True
    return False


# ── Information gallery ───────────────────────────────────────────────────────

def list_information(category: str = "All") -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if _table_ok("information_items"):
        try:
            resp = (
                _client()
                .table("information_items")
                .select("*")
                .order("created_at", desc=True)
                .execute()
            )
            rows = resp.data or []
        except Exception as exc:
            logger.warning("list_information failed: %s", exc)
    if not rows:
        rows = list(_MEM_GALLERY)
    if category and category.lower() not in ("all", "all crops"):
        key = category.lower()
        rows = [
            r
            for r in rows
            if key in (r.get("category") or "").lower()
            or key in (r.get("disease_name") or "").lower()
        ]
    return rows


def create_information(
    payload: dict[str, Any],
    image_bytes: bytes | None = None,
    filename: str | None = None,
) -> dict[str, Any]:
    image_url = payload.get("image_url")
    if image_bytes and filename:
        image_url = upload_image(image_bytes, f"info-{uuid.uuid4().hex[:8]}-{filename}")
    if not image_url:
        raise ValueError("An image is required.")
    row = {
        "id": str(uuid.uuid4()),
        "disease_name": payload.get("disease_name") or "Unknown",
        "caption": payload.get("caption") or "",
        "image_url": image_url,
        "category": payload.get("category") or payload.get("disease_name") or "All",
        "created_at": _now(),
    }
    if _table_ok("information_items"):
        try:
            resp = _client().table("information_items").insert(row).execute()
            if resp.data:
                row = resp.data[0]
        except Exception as exc:
            logger.warning("create_information failed: %s", exc)
            _MEM_GALLERY.insert(0, row)
    else:
        _MEM_GALLERY.insert(0, row)
    add_audit(f"INFORMATION_UPLOADED - {row['disease_name']}")
    return row


def delete_information(item_id: str) -> bool:
    if _table_ok("information_items"):
        try:
            _client().table("information_items").delete().eq("id", item_id).execute()
        except Exception as exc:
            logger.warning("delete_information failed: %s", exc)
    global _MEM_GALLERY
    _MEM_GALLERY = [r for r in _MEM_GALLERY if r["id"] != item_id]
    return True


# ── Crops ─────────────────────────────────────────────────────────────────────

def _seed_crops() -> None:
    global _CROPS_SEEDED, _MEM_CROPS
    if _CROPS_SEEDED:
        return
    _CROPS_SEEDED = True
    seeded = [
        {
            "id": str(uuid.uuid4()),
            "name": "Wheat",
            "description": "Primary cereal crop monitored for rust, mildew, and blight.",
            "image_url": None,
            "status": "active",
            "created_at": _now(),
        },
        {
            "id": str(uuid.uuid4()),
            "name": "Barley",
            "description": "Secondary cereal used for rotation and disease comparison.",
            "image_url": None,
            "status": "active",
            "created_at": _now(),
        },
        {
            "id": str(uuid.uuid4()),
            "name": "Maize",
            "description": "Corn crop tracked for rust and leaf-spot diagnosis.",
            "image_url": None,
            "status": "active",
            "created_at": _now(),
        },
    ]
    if _table_ok("crops"):
        try:
            existing = _client().table("crops").select("id").limit(1).execute()
            if not existing.data:
                _client().table("crops").insert(seeded).execute()
            return
        except Exception as exc:
            logger.warning("crop seed insert failed: %s", exc)
    if not _MEM_CROPS:
        _MEM_CROPS = seeded


def list_crops(search: str = "", page: int = 1, limit: int = 10) -> tuple[list[dict[str, Any]], int]:
    _seed_crops()
    rows: list[dict[str, Any]] = []
    if _table_ok("crops"):
        try:
            resp = _client().table("crops").select("*").order("created_at", desc=True).execute()
            rows = resp.data or []
        except Exception as exc:
            logger.warning("list_crops failed: %s", exc)
    if not rows:
        rows = list(_MEM_CROPS)
    q = search.strip().lower()
    if q:
        rows = [
            r
            for r in rows
            if q in (r.get("name") or "").lower() or q in (r.get("description") or "").lower()
        ]
    total = len(rows)
    start = (page - 1) * limit
    return rows[start : start + limit], total


def create_crop(payload: dict[str, Any], image_bytes: bytes | None = None, filename: str | None = None) -> dict[str, Any]:
    _seed_crops()
    image_url = None
    if image_bytes and filename:
        image_url = upload_image(image_bytes, f"crop-{uuid.uuid4().hex[:8]}-{filename}")
    row = {
        "id": str(uuid.uuid4()),
        "name": (payload.get("name") or "Unnamed").strip(),
        "description": payload.get("description") or "",
        "image_url": image_url,
        "status": payload.get("status") or "active",
        "created_at": _now(),
    }
    if _table_ok("crops"):
        try:
            resp = _client().table("crops").insert(row).execute()
            if resp.data:
                row = resp.data[0]
        except Exception as exc:
            logger.warning("create_crop failed: %s", exc)
            _MEM_CROPS.insert(0, row)
    else:
        _MEM_CROPS.insert(0, row)
    add_audit(f"CROP_CREATED - {row['name']}", event_type="Crop Created")
    return row


def update_crop(
    crop_id: str,
    payload: dict[str, Any],
    image_bytes: bytes | None = None,
    filename: str | None = None,
) -> dict[str, Any] | None:
    rows, _ = list_crops(limit=500)
    current = next((r for r in rows if str(r.get("id")) == crop_id), None)
    if current is None:
        return None
    patch = {k: v for k, v in payload.items() if v is not None}
    if image_bytes and filename:
        patch["image_url"] = upload_image(image_bytes, f"crop-{uuid.uuid4().hex[:8]}-{filename}")
    updated = {**current, **patch}
    if _table_ok("crops"):
        try:
            resp = _client().table("crops").update(patch).eq("id", crop_id).execute()
            if resp.data:
                updated = resp.data[0]
        except Exception as exc:
            logger.warning("update_crop failed: %s", exc)
    else:
        for i, r in enumerate(_MEM_CROPS):
            if r["id"] == crop_id:
                _MEM_CROPS[i] = updated
                break
    add_audit(f"CROP_UPDATED - {updated.get('name')}", event_type="Crop Updated")
    return updated


def delete_crop(crop_id: str) -> bool:
    if _table_ok("crops"):
        try:
            _client().table("crops").delete().eq("id", crop_id).execute()
        except Exception as exc:
            logger.warning("delete_crop failed: %s", exc)
    global _MEM_CROPS
    _MEM_CROPS = [r for r in _MEM_CROPS if r["id"] != crop_id]
    add_audit(f"CROP_DELETED - {crop_id}", level="ALERT", event_type="Crop Deleted", status="Success")
    return True


# ── Settings ──────────────────────────────────────────────────────────────────

def get_settings() -> dict[str, Any]:
    row: dict[str, Any] = dict(_MEM_SETTINGS)
    if _table_ok("system_settings"):
        try:
            resp = _client().table("system_settings").select("*").eq("id", "default").limit(1).execute()
            if resp.data:
                row = {**_MEM_SETTINGS, **resp.data[0]}
        except Exception as exc:
            logger.warning("get_settings failed: %s", exc)
    return row


def save_settings(payload: dict[str, Any]) -> dict[str, Any]:
    current = get_settings()
    allowed = (
        "site_title",
        "support_email",
        "language",
        "email_notifications",
        "push_notifications",
        "system_alerts",
        "description",
        "username",
        "admin_email",
    )
    patch = {k: payload[k] for k in allowed if k in payload}
    patch["updated_at"] = _now()
    updated = {**current, **patch, "id": "default"}
    if _table_ok("system_settings"):
        try:
            _client().table("system_settings").upsert(updated).execute()
        except Exception as exc:
            logger.warning("save_settings failed: %s", exc)
    else:
        _MEM_SETTINGS.update(updated)
    add_audit("SETTINGS_UPDATED")
    return updated


# ── Dashboard helpers ─────────────────────────────────────────────────────────

def weekly_series(records: list[Any] | None = None) -> list[dict[str, Any]]:
    """Mon–Sun counts of predictions / detections over the last 7 days.

    Accepts an optional pre-fetched ``records`` list (newest-first prediction
    records) so callers that already pulled recent predictions — e.g. the admin
    dashboard — don't pay for a second round-trip to fetch the same rows.
    """
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    series = {i: {"day": days[i], "predictions": 0, "diseased": 0} for i in range(7)}
    try:
        if records is None:
            from app.database.crud import get_recent_predictions

            records, _ = get_recent_predictions(limit=200)
        now = datetime.now(timezone.utc)
        week_ago = now - timedelta(days=6)
        for rec in records:
            raw = getattr(rec, "created_at", None)
            if not raw:
                continue
            try:
                dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
            except Exception:
                continue
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            if dt < week_ago:
                continue
            idx = dt.weekday()
            series[idx]["predictions"] += 1
            cls = (getattr(rec, "predicted_class", "") or "").lower()
            if cls and cls != "healthy":
                series[idx]["diseased"] += 1
    except Exception as exc:
        logger.warning("weekly_series failed: %s", exc)
    # chronological Mon–Sun relative to today is less important than matching the mock
    return [series[i] for i in range(7)]

# ── User Predictions ──────────────────────────────────────────────────────────

def list_user_predictions(
    user_id: str,
    search: str = "",
    page: int = 1,
    limit: int = 20,
) -> tuple[list[dict[str, Any]], int]:
    """
    Return all predictions belonging to one user, enriched with profile data.
    """

    rows: list[dict[str, Any]] = []

    try:
        query = (
            _client()
            .table("predictions")
            .select(
                "*, profiles!predictions_user_id_fkey("
                "id,name,email,organization_name,role"
                ")"
            )
            .eq("user_id", user_id)
            .order("created_at", desc=True)
        )

        resp = query.execute()
        rows = resp.data or []

    except Exception as exc:
        logger.warning("list_user_predictions failed: %s", exc)

        # Fallback: get predictions without the profile join
        try:
            resp = (
                _client()
                .table("predictions")
                .select("*")
                .eq("user_id", user_id)
                .order("created_at", desc=True)
                .execute()
            )
            rows = resp.data or []
        except Exception as inner_exc:
            logger.warning(
                "list_user_predictions fallback failed: %s",
                inner_exc,
            )

    q = search.strip().lower()

    if q:
        rows = [
            r
            for r in rows
            if q in str(r.get("filename") or "").lower()
            or q in str(r.get("predicted_class") or "").lower()
            or q in str(r.get("severity") or "").lower()
            or q in str(r.get("confidence_level") or "").lower()
        ]

    total = len(rows)

    start = (page - 1) * limit
    paginated = rows[start : start + limit]

    return paginated, total



def list_user_predictions(
    user_id: str,
    search: str = "",
    page: int = 1,
    limit: int = 20,
) -> tuple[list[dict[str, Any]], int]:
    try:
        response = (
            _client()
            .table("predictions")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )

        rows = response.data or []

    except Exception as exc:
        logger.warning("list_user_predictions failed: %s", exc)
        rows = []

    # Search
    q = search.strip().lower()

    if q:
        rows = [
            row
            for row in rows
            if q in str(row.get("filename") or "").lower()
            or q in str(row.get("predicted_class") or "").lower()
            or q in str(row.get("severity") or "").lower()
            or q in str(row.get("confidence_level") or "").lower()
        ]

    total = len(rows)

    # Pagination
    start = (page - 1) * limit
    end = start + limit

    return rows[start:end], total