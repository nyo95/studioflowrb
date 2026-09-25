import type { DocumentOrientation, DocumentPaper, DocumentPrintFormat } from "../layouts/document";

export const DEFAULT_PRINT_FORMAT: DocumentPrintFormat = { paper: "A4", orientation: "portrait" };

/** Reads `?paper=&orientation=` (as read from a page's own `searchParams`); defaults to A4 portrait for anything else. */
export function printFormatFromSearchParams(params: { paper?: string; orientation?: string }): DocumentPrintFormat {
  const paper: DocumentPaper = params.paper === "LETTER" ? "LETTER" : "A4";
  const orientation: DocumentOrientation = params.orientation === "landscape" ? "landscape" : "portrait";
  return { paper, orientation };
}
