/**
 * HTTP request logger middleware.
 *
 * Logs: timestamp · HTTP method · path · status code · response time
 *
 * Example output:
 *   [2026-08-22T10:23:01.456Z] POST /api/auth/login 200 34ms
 *   [2026-08-22T10:23:05.123Z] GET  /api/auth/me   401 5ms
 */
export const requestLogger = (req, res, next) => {
  const start = Date.now();

  // Hook into the response finish event so we can log the final status code
  res.on("finish", () => {
    const duration = Date.now() - start;
    const timestamp = new Date().toISOString();
    const method = req.method.padEnd(6);
    const url = req.originalUrl || req.url;
    const status = res.statusCode;

    // Color-code status for easier reading in a terminal
    const statusStr = colorStatus(status);

    console.log(
      `[${timestamp}] ${method} ${url} ${statusStr} ${duration}ms`
    );
  });

  next();
};

/**
 * Returns a terminal-colored status code string.
 * 2xx → green, 3xx → cyan, 4xx → yellow, 5xx → red
 */
const colorStatus = (status) => {
  if (status >= 500) return `\x1b[31m${status}\x1b[0m`; // red
  if (status >= 400) return `\x1b[33m${status}\x1b[0m`; // yellow
  if (status >= 300) return `\x1b[36m${status}\x1b[0m`; // cyan
  if (status >= 200) return `\x1b[32m${status}\x1b[0m`; // green
  return String(status);
};
