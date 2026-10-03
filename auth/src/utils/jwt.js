import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || "30d";

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is not set");
}

/**
 * Sign an access token.
 * Payload shape: { sub, email, name, role }
 */
export const signAccessToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: "auth-api"
  });
};

/**
 * Sign a refresh token (longer-lived, minimal payload).
 * Payload shape: { sub }
 */
export const signRefreshToken = (payload) => {
  return jwt.sign({ sub: payload.sub }, JWT_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
    issuer: "auth-api"
  });
};

/**
 * Verify any JWT and return the decoded payload.
 * Throws JsonWebTokenError / TokenExpiredError on failure.
 */
export const verifyToken = (token) => {
  return jwt.verify(token, JWT_SECRET, {
    issuer: "auth-api"
  });
};
