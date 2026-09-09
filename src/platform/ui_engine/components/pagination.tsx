import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { HTMLAttributes } from "react";

import { cx } from "../internal/cx";
import { buttonClasses } from "../primitives/button-classes";

export type PaginationProps = Omit<HTMLAttributes<HTMLElement>, "onChange"> & {
  page: number;
  pageCount: number;
  /** Client directories that hold page state locally. */
  onPageChange?: (page: number) => void;
  /** Server-rendered directories supply a URL per page instead of a callback. */
  getHref?: (page: number) => string;
  /** Row total. When given, the summary reads "1–20 of 96" rather than "Page 1 of 5". */
  total?: number;
  pageSize?: number;
  label?: string;
};

export function Pagination({
  page,
  pageCount,
  onPageChange,
  getHref,
  total,
  pageSize,
  label = "Pagination",
  className,
  ...props
}: PaginationProps) {
  const safePageCount = Math.max(1, pageCount);
  const safePage = Math.min(Math.max(1, page), safePageCount);
  const atStart = safePage <= 1;
  const atEnd = safePage >= safePageCount;

  let summary: string;
  if (typeof total === "number" && typeof pageSize === "number" && pageSize > 0) {
    if (total === 0) {
      summary = "No rows";
    } else {
      const first = (safePage - 1) * pageSize + 1;
      const last = Math.min(safePage * pageSize, total);
      summary = `${first}–${last} of ${total}`;
    }
  } else {
    summary = `Page ${safePage} of ${safePageCount}`;
  }

  function step(target: number, disabled: boolean, direction: "previous" | "next") {
    const content = direction === "previous" ? "Previous" : "Next";
    const icon = direction === "previous" ? <ChevronLeft aria-hidden="true" /> : <ChevronRight aria-hidden="true" />;
    if (disabled || !getHref) {
      return (
        <button
          type="button"
          className={buttonClasses("secondary", "sm")}
          disabled={disabled}
          onClick={onPageChange ? () => onPageChange(target) : undefined}
        >
          {direction === "previous" ? icon : null}
          {content}
          {direction === "next" ? icon : null}
        </button>
      );
    }
    return (
      <Link href={getHref(target)} className={buttonClasses("secondary", "sm")} rel={direction}>
        {direction === "previous" ? icon : null}
        {content}
        {direction === "next" ? icon : null}
      </Link>
    );
  }

  return (
    <nav className={cx("flex items-center justify-between gap-3 max-[720px]:flex-col max-[720px]:items-stretch", className)} aria-label={label} {...props}>
      <span className="text-ink-secondary text-sm">{summary}</span>
      <div className="flex gap-1.5">
        {step(safePage - 1, atStart, "previous")}
        {step(safePage + 1, atEnd, "next")}
      </div>
    </nav>
  );
}
