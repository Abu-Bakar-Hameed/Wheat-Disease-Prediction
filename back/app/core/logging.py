"""
WheatGuard AI – Structured Logging
Configures application-wide logging with console + rotating file handlers.
"""

from __future__ import annotations

import logging
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path


def setup_logging(
    level: str = "INFO",
    log_file: Path | None = None,
    max_bytes: int = 10 * 1024 * 1024,  # 10 MB
    backup_count: int = 5,
) -> logging.Logger:
    """
    Configure the root logger for WheatGuard AI.

    Args:
        level:        Logging level string (DEBUG, INFO, WARNING, ERROR, CRITICAL).
        log_file:     Optional path to a rotating log file.
        max_bytes:    Maximum size of a single log file before rotation.
        backup_count: Number of rotated log files to keep.

    Returns:
        The configured root logger.
    """
    log_format = (
        "%(asctime)s | %(levelname)-8s | %(name)s:%(lineno)d | %(message)s"
    )
    date_format = "%Y-%m-%d %H:%M:%S"

    # Remove any handlers already attached to root (avoids duplicate output)
    root_logger = logging.getLogger()
    root_logger.handlers.clear()

    numeric_level = getattr(logging, level.upper(), logging.INFO)
    root_logger.setLevel(numeric_level)

    formatter = logging.Formatter(fmt=log_format, datefmt=date_format)

    # ── Console handler ───────────────────────────────────────────────────────
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(numeric_level)
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)

    # ── File handler (optional) ───────────────────────────────────────────────
    if log_file is not None:
        log_file = Path(log_file)
        log_file.parent.mkdir(parents=True, exist_ok=True)
        file_handler = RotatingFileHandler(
            filename=log_file,
            maxBytes=max_bytes,
            backupCount=backup_count,
            encoding="utf-8",
        )
        file_handler.setLevel(numeric_level)
        file_handler.setFormatter(formatter)
        root_logger.addHandler(file_handler)

    # Silence noisy third-party loggers
    for noisy in ("uvicorn.access", "httpx", "httpcore"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    return root_logger


def get_logger(name: str) -> logging.Logger:
    """
    Return a named child logger.

    Usage::

        from app.core.logging import get_logger
        logger = get_logger(__name__)
        logger.info("Model loaded successfully.")
    """
    return logging.getLogger(name)
