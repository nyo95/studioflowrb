/**
 * File elements on the Workspace board (WO-SF-WORKSPACE-04). Pure: no storage or framework imports.
 * The extension of the original name chooses the type from a fixed allow-list; the bytes must agree where the format
 * has a signature, so a renamed file cannot pose as another kind. The client's claimed content type is never used.
 */

export const WORKSPACE_FILE_BYTES = 25 * 1024 * 1024;
export const WORKSPACE_FILE_NAME_MAX = 200;

type FileRule = { contentType: string; signature?: "pdf" | "zip" | "ole" | "dwg" | "text" };

export const WORKSPACE_FILE_TYPES: Record<string, FileRule> = {
  pdf: { contentType: "application/pdf", signature: "pdf" },
  dwg: { contentType: "application/acad", signature: "dwg" },
  dxf: { contentType: "application/dxf", signature: "text" },
  skp: { contentType: "application/vnd.sketchup.skp" },
  xlsx: { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", signature: "zip" },
  xls: { contentType: "application/vnd.ms-excel", signature: "ole" },
  docx: { contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", signature: "zip" },
  doc: { contentType: "application/msword", signature: "ole" },
  pptx: { contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", signature: "zip" },
  zip: { contentType: "application/zip", signature: "zip" },
  txt: { contentType: "text/plain", signature: "text" },
  csv: { contentType: "text/csv", signature: "text" },
};

/** The lower-case extension of a file name, or null when it has none. */
export function fileExtension(name: string): string | null {
  const match = /\.([A-Za-z0-9]{1,5})$/.exec(name.trim());
  return match ? match[1].toLowerCase() : null;
}

function startsWith(body: Uint8Array, bytes: readonly number[]): boolean {
  return body.length >= bytes.length && bytes.every((byte, index) => body[index] === byte);
}

/** True when the bytes agree with the extension's signature (or the format has none). */
export function sniffWorkspaceFile(body: Uint8Array, extension: string): boolean {
  const rule = WORKSPACE_FILE_TYPES[extension];
  if (!rule) return false;
  switch (rule.signature) {
    case "pdf": return startsWith(body, [0x25, 0x50, 0x44, 0x46]);
    case "zip": return startsWith(body, [0x50, 0x4b, 0x03, 0x04]) || startsWith(body, [0x50, 0x4b, 0x05, 0x06]);
    case "ole": return startsWith(body, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    case "dwg": return startsWith(body, [0x41, 0x43, 0x31, 0x30]);
    // Plain text: no NUL byte in the first 8 KB.
    case "text": return !body.subarray(0, 8192).includes(0);
    default: return true;
  }
}
