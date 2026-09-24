import type { HTMLAttributes, ReactNode } from "react";

import { cx } from "../internal/cx";

/** Paper stock a `DocumentSheet` can print at, keyed the same way the CSS `@page size` value is written. */
export type DocumentPaper = "A4" | "LETTER";
export type DocumentOrientation = "portrait" | "landscape";
export type DocumentPrintFormat = { paper: DocumentPaper; orientation: DocumentOrientation };

const PAPER_CSS_SIZE: Record<DocumentPaper, string> = { A4: "A4", LETTER: "letter" };
/** On-screen preview width only — vertical flow is open-ended (`min-h-dvh`), not a fixed page height. */
const PAPER_PREVIEW_WIDTH: Record<DocumentPaper, Record<DocumentOrientation, string>> = {
  A4: { portrait: "210mm", landscape: "297mm" },
  LETTER: { portrait: "215.9mm", landscape: "279.4mm" },
};

export type DocumentSheetProps = HTMLAttributes<HTMLDivElement> & {
  /** Screen-only controls above the sheet (print, back link). Hidden when printing. */
  toolbar?: ReactNode;
  /** Paper format for the screen preview; printing uses the `@page` rule. Ignored when `printFormat` is given. */
  format?: "a4-portrait" | "a4-landscape";
  /**
   * Selectable paper/orientation (UI_ENGINE §13 addition): drives both the
   * on-screen preview width and an injected `@page { size: ...; }` rule, so
   * what prints actually matches what was picked — pair with
   * `PrintFormatPicker` for a user-facing control. Plain data, not owned
   * state, so the component stays server-safe. Falls back to the base A4
   * `@page` rule from the engine's global print CSS when omitted.
   */
  printFormat?: DocumentPrintFormat;
};

/**
 * Print-safe document frame (UI_ENGINE §13). The engine owns the paper surface
 * and print visibility; the app owns every word, number, and page break inside.
 * Server-safe: no client hooks.
 */
export function DocumentSheet({ toolbar, format = "a4-portrait", printFormat, className, style, children, ...props }: DocumentSheetProps) {
  const previewWidth = printFormat
    ? PAPER_PREVIEW_WIDTH[printFormat.paper][printFormat.orientation]
    : format === "a4-landscape" ? "297mm" : "210mm";
  const padding = (printFormat?.orientation ?? (format === "a4-landscape" ? "landscape" : "portrait")) === "landscape"
    ? "px-[14mm] py-[12mm]"
    : "px-[16mm] py-[14mm]";
  return (
    <div className="ui-document min-h-dvh bg-canvas px-4 py-6 print:bg-white print:p-0">
      {printFormat ? (
        <style>{`@page { size: ${PAPER_CSS_SIZE[printFormat.paper]} ${printFormat.orientation}; }`}</style>
      ) : null}
      {toolbar ? (
        <div className="ui-print-hidden mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-2">{toolbar}</div>
      ) : null}
      <div
        className={cx(
          "mx-auto bg-white text-black shadow-[0_1px_3px_rgb(0_0_0/0.12)] print:max-w-none print:shadow-none",
          padding,
          "print:px-0 print:py-0",
          className,
        )}
        style={{ maxWidth: previewWidth, ...style }}
        data-format={format}
        data-paper={printFormat?.paper}
        data-orientation={printFormat?.orientation}
        {...props}
      >
        {children}
      </div>
    </div>
  );
}

/** Keeps a block on one printed page where possible. */
export function DocumentBlock({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("break-inside-avoid", className)} {...props} />;
}
