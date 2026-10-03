/**
 * WheatGuard AI – TOTP (RFC 6238) utility for two-factor authentication.
 *
 * Self-contained (uses Node's built-in crypto, no third-party dependency) so
 * 2FA works with nothing extra to install. Implements the exact same algorithm
 * Google Authenticator / Authy / 1Password expect:
 *   HMAC-SHA1, 6 digits, 30-second period, Base32 shared secret.
 *
 * The SAME secret is verified here (at login) and by the FastAPI backend (when
 * the user enrols/turns 2FA off), so the two services must agree on the maths.
 */

import crypto from "crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const PERIOD_SECONDS = 30;
const DIGITS = 6;

/** Generate a fresh random Base32 secret (20 bytes -> 32 chars, unpadded). */
export function generateSecret(bytes = 20) {
  return base32Encode(crypto.randomBytes(bytes));
}

function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(secret) {
  const clean = String(secret).toUpperCase().replace(/=+$/g, "").replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Compute the 6-digit code for a given unix time (defaults to now). */
export function totpCode(secret, timeMs = Date.now()) {
  const key = base32Decode(secret);
  if (key.length === 0) return "";
  const counter = Math.floor(timeMs / 1000 / PERIOD_SECONDS);
  // 8-byte big-endian counter, exactly as RFC 4226/6238 specify.
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(bin % 10 ** DIGITS).padStart(DIGITS, "0");
}

/**
 * Verify a user-supplied code, tolerating +/- one period of clock drift.
 * Constant-time on the trimmed strings; returns false for any malformed input.
 */
export function verifyTotp(secret, code, timeMs = Date.now()) {
  if (!secret || !code) return false;
  const normalized = String(code).replace(/\D/g, "");
  if (normalized.length !== DIGITS) return false;
  for (let step = -1; step <= 1; step++) {
    const expected = totpCode(secret, timeMs + step * PERIOD_SECONDS * 1000);
    if (
      expected.length === normalized.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(normalized))
    ) {
      return true;
    }
  }
  return false;
}

/** Build the otpauth:// URI an authenticator app turns into a QR code. */
export function totpUri({ secret, email, issuer = "WheatGuard" }) {
  const label = encodeURIComponent(`${issuer}:${email || "account"}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
