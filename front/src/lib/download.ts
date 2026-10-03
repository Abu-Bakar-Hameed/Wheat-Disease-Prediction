/**
 * WheatGuard AI – Download Utilities
 * All client-side file download helpers live here.
 */

/** Trigger a browser download from a Blob */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Download any URL as a file (works for same-origin and CORS-enabled URLs) */
export async function downloadUrl(url: string, filename: string): Promise<void> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    downloadBlob(blob, filename);
  } catch {
    // Fallback: open in new tab if fetch fails (e.g. CORS)
    const a   = document.createElement("a");
    a.href     = url;
    a.download = filename;
    a.target   = "_blank";
    a.rel      = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

/** Download a base64 data-URI string as a PNG file */
export function downloadBase64Image(dataUri: string, filename: string) {
  const a   = document.createElement("a");
  a.href     = dataUri;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Convert a raw base64 string (no prefix) to a downloadable data URI.
 * If already a data URI or URL, returns as-is.
 */
export function toDataUri(b64: string): string {
  if (b64.startsWith("data:") || b64.startsWith("http")) return b64;
  return `data:image/png;base64,${b64}`;
}

/** Download a plain object as a .json file */
export function downloadJson(obj: unknown, filename: string) {
  const json = JSON.stringify(obj, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  downloadBlob(blob, filename);
}

/** Download a CSV string as a .csv file */
export function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, filename);
}

/**
 * Build a sanitised filename from parts, removing illegal characters.
 * e.g. sanitiseFilename("Yellow Rust", "2025-01-01", "json") → "Yellow_Rust_2025-01-01.json"
 */
export function sanitiseFilename(...parts: string[]): string {
  return parts
    .join("_")
    .replace(/[<>:"/\\|?*\s]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}
