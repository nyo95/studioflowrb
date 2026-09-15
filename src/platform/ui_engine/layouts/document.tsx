import type { HTMLAttributes, ReactNode } from "react";

import { cx } from "../internal/cx";

export type DocumentSheetProps = HTMLAttributes<HTMLDivElement> & {
  /** Screen-only controls above the sheet (print, back link). Hidden when printing. */
  toolbar?: ReactNode;
  /** Paper format for the screen preview; printing uses the `@page` rule. */
  format?: "a4-portrait" | "a4-landscape";
};

/**
 * Print-safe document frame (UI_ENGINE §13). The engine owns the paper surface
 * and print visibility; the app owns every word, number, and page break inside.
 * Server-safe: no client hooks.
 */
export function DocumentSheet({ toolbar, format = "a4-portrait", className, children, ...props }: DocumentSheetProps) {
  return (
    <div className="ui-document min-h-dvh bg-canvas px-4 py-6 print:bg-white print:p-0">
      {toolbar ? (
        <div className="ui-print-hidden mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-2">{toolbar}</div>
      ) : null}
      <div
        className={cx(
          "mx-auto bg-white text-black shadow-[0_1px_3px_rgb(0_0_0/0.12)] print:max-w-none print:shadow-none",
          format === "a4-landscape" ? "max-w-[297mm] px-[14mm] py-[12mm]" : "max-w-[210mm] px-[16mm] py-[14mm]",
          "print:px-0 print:py-0",
          className,
        )}
        data-format={format}
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
