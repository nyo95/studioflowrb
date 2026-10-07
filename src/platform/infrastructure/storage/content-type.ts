import path from "node:path";

/** Safe fallback when a route has a storage key but no persisted file metadata. */
export function contentTypeFromKey(key: string): string {
  switch (path.extname(key).toLowerCase()) {
    case ".pdf": return "application/pdf";
    case ".zip": return "application/zip";
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    default: return "application/octet-stream";
  }
}
