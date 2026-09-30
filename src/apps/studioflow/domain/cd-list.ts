/** Pure CD List display rules retained from the StudioFlow legacy workflow. */

export function normalizeDrawingCode(value: string): string {
  const number = value
    .trim()
    .toUpperCase()
    .replace(/^(?:(?:ARS|ID)[_\-\s.]*)+/, "")
    .replace(/^[_\-\s.]+/, "")
    .trim();
  return `ID_${number}`;
}

export function drawingNumber(code: string): number | null {
  const number = code.replace(/^ID_/, "");
  if (!/^\d+(?:\.\d+)?$/.test(number)) return null;
  const parsed = Number(number);
  return Number.isFinite(parsed) ? parsed : null;
}

export function drawingGroup(code: string): string {
  const number = drawingNumber(code);
  return number === null ? "-" : String(Math.floor(number / 100) * 100);
}
