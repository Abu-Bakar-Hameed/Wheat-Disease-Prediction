"""
WheatGuard AI – TOTP (RFC 6238) helper for two-factor authentication.

Standard HMAC-SHA1 / 6-digit / 30-second TOTP, implemented with the standard
library only so it needs no extra dependency. It produces byte-for-byte the
same codes as ``auth/src/utils/totp.js`` (the auth service that enforces 2FA at
login), because both follow RFC 6238 against the same shared secret — which is
exactly why the enrolment here and the challenge at login interoperate.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import struct
import time

_DIGITS = 6
_PERIOD = 30
_ISSUER = "WheatGuard"


def generate_secret(nbytes: int = 20) -> str:
    """Return a fresh unpadded Base32 shared secret (RFC 4648 alphabet)."""
    return base64.b32encode(secrets.token_bytes(nbytes)).decode("ascii").rstrip("=")


def _decode_secret(secret: str) -> bytes:
    pad = "=" * ((8 - len(secret) % 8) % 8)
    return base64.b32decode(secret.upper() + pad, casefold=True)


def totp_code(secret: str, at_time: float | None = None) -> str:
    """Compute the current 6-digit code for ``secret`` (``at_time`` in epoch s)."""
    try:
        key = _decode_secret(secret)
    except Exception:
        return ""
    if not key:
        return ""
    counter = int((at_time if at_time is not None else time.time()) // _PERIOD)
    msg = struct.pack(">Q", counter)
    digest = hmac.new(key, msg, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    binary = (
        ((digest[offset] & 0x7F) << 24)
        | ((digest[offset + 1] & 0xFF) << 16)
        | ((digest[offset + 2] & 0xFF) << 8)
        | (digest[offset + 3] & 0xFF)
    )
    return str(binary % (10 ** _DIGITS)).zfill(_DIGITS)


def verify_totp(secret: str, code: str) -> bool:
    """Constant-time verify, tolerating +/- one period of clock drift."""
    if not secret or not code:
        return False
    digits = "".join(ch for ch in str(code) if ch.isdigit())
    if len(digits) != _DIGITS:
        return False
    now = time.time()
    for step in (-1, 0, 1):
        expected = totp_code(secret, now + step * _PERIOD)
        if expected and hmac.compare_digest(expected, digits):
            return True
    return False


def otpauth_uri(secret: str, email: str) -> str:
    """Build the ``otpauth://`` URI an authenticator app renders as a QR code."""
    label = f"{_ISSUER}:{email or 'account'}"
    from urllib.parse import quote

    query = (
        f"secret={secret}"
        f"&issuer={quote(_ISSUER)}"
        "&algorithm=SHA1"
        f"&digits={_DIGITS}"
        f"&period={_PERIOD}"
    )
    return f"otpauth://totp/{quote(label)}?{query}"
