"""
WheatGuard AI – Supabase Client
Provides a singleton Supabase client used across all database operations.
"""

from __future__ import annotations

from functools import lru_cache

from supabase import Client, create_client

from app.core.config import settings
from app.core.exceptions import DatabaseError
from app.core.logging import get_logger

logger = get_logger(__name__)


@lru_cache(maxsize=1)
def get_supabase_client() -> Client:
    """
    Return a cached Supabase client using the service-role key.

    The service-role key bypasses Row Level Security (RLS) and is safe to use
    server-side only. Never expose it to the browser.

    Returns:
        Authenticated Supabase Client instance.

    Raises:
        DatabaseError: If the URL or key is missing / client creation fails.
    """
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise DatabaseError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env "
            "before the database can be used."
        )
    try:
        client: Client = create_client(
            settings.supabase_url,
            settings.supabase_service_role_key,
        )
        logger.info("Supabase client created for project: %s", settings.supabase_url)
        return client
    except Exception as exc:
        logger.error("Failed to create Supabase client: %s", exc, exc_info=True)
        raise DatabaseError(f"Could not initialise Supabase client: {exc}") from exc


import asyncio


async def check_database_health() -> bool:
    """
    Lightweight connectivity check used by the /health endpoint.

    Executes a minimal SELECT against the predictions table.
    Returns True on success, False on any error (does NOT raise).
    """
    def _ping() -> bool:
        client = get_supabase_client()
        client.table("predictions").select("id").limit(1).execute()
        return True

    try:
        return await asyncio.wait_for(asyncio.to_thread(_ping), timeout=3.0)
    except asyncio.TimeoutError:
        # asyncio.TimeoutError has an empty str(), which previously produced a
        # confusing "Database health check failed: " log line with no reason.
        logger.warning("Database health check timed out after 3.0s")
        return False
    except Exception as exc:
        logger.warning("Database health check failed: %s", exc or type(exc).__name__)
        return False

