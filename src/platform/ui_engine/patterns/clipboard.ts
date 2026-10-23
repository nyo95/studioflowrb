"use client";

/**
 * Clipboard writes shared by every app. The async Clipboard API only exists in a secure context (https or
 * localhost); text falls back to the legacy copy command so an office machine on a plain-http address still works.
 * Images have no fallback: they need the async API and are always written as PNG, the one type every browser accepts.
 */
export async function writeClipboardText(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Permission refused or document not focused: try the legacy path below.
    }
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  const copied = document.execCommand("copy");
  area.remove();
  if (!copied) throw new Error("The browser refused to copy.");
}

export function canWriteClipboardImage(): boolean {
  return typeof window !== "undefined" && window.isSecureContext && typeof ClipboardItem !== "undefined" && !!navigator.clipboard?.write;
}

/** Copy the image at `url` (same origin or CORS-enabled) as a PNG. */
export async function writeClipboardImage(url: string): Promise<void> {
  if (!canWriteClipboardImage()) throw new Error("Copying an image needs the app on https or localhost.");
  // The PNG is produced inside the ClipboardItem promise so the click's user activation still covers the write.
  const png = (async () => {
    const response = await fetch(url);
    if (!response.ok) throw new Error("The image could not be loaded.");
    const blob = await response.blob();
    if (blob.type === "image/png") return blob;
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
    bitmap.close();
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => (result ? resolve(result) : reject(new Error("The image could not be converted."))), "image/png"));
  })();
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}

/**
 * Rows as tab-separated text, the format a spreadsheet pastes cell by cell. Tabs and line breaks inside a value
 * would split it into other cells, so they become spaces.
 */
export function toSpreadsheetText(rows: ReadonlyArray<ReadonlyArray<string | null | undefined>>): string {
  return rows.map((row) => row.map((cell) => (cell ?? "").replace(/[\t\r\n]+/g, " ").trim()).join("\t")).join("\n");
}
