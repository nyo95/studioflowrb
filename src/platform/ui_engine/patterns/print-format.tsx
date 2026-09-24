"use client";

import { useRouter, useSearchParams } from "next/navigation";

import type { DocumentOrientation, DocumentPaper, DocumentPrintFormat } from "../layouts/document";
import { Select } from "../primitives/forms";

export const DEFAULT_PRINT_FORMAT: DocumentPrintFormat = { paper: "A4", orientation: "portrait" };

/** Reads `?paper=&orientation=` (as read from a page's own `searchParams`); defaults to A4 portrait for anything else. */
export function printFormatFromSearchParams(params: { paper?: string; orientation?: string }): DocumentPrintFormat {
  const paper: DocumentPaper = params.paper === "LETTER" ? "LETTER" : "A4";
  const orientation: DocumentOrientation = params.orientation === "landscape" ? "landscape" : "portrait";
  return { paper, orientation };
}

/**
 * Paper/orientation selectors for a printable `DocumentSheet` page. Writes its
 * choice into the URL (`?paper=&orientation=`) via `router.replace` — the same
 * URL-driven-filter idiom used elsewhere in this app — so the server component
 * re-renders with the matching `printFormat` and the browser's print/PDF
 * output actually matches what was picked, not just the on-screen preview.
 */
export function PrintFormatPicker({ value }: { value: DocumentPrintFormat }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const update = (next: Partial<DocumentPrintFormat>) => {
    const params = new URLSearchParams(searchParams.toString());
    const merged = { ...value, ...next };
    params.set("paper", merged.paper);
    params.set("orientation", merged.orientation);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-ink-secondary">
      <label className="flex items-center gap-1.5">
        Paper
        <Select density="compact" className="w-24" value={value.paper} onChange={(e) => update({ paper: e.target.value as DocumentPaper })}>
          <option value="A4">A4</option>
          <option value="LETTER">Letter</option>
        </Select>
      </label>
      <label className="flex items-center gap-1.5">
        Orientation
        <Select density="compact" className="w-28" value={value.orientation} onChange={(e) => update({ orientation: e.target.value as DocumentOrientation })}>
          <option value="portrait">Portrait</option>
          <option value="landscape">Landscape</option>
        </Select>
      </label>
    </div>
  );
}
