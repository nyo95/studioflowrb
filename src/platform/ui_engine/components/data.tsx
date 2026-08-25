"use client";

import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsUpDown, Search, X } from "lucide-react";
import {
  forwardRef,
  type CSSProperties,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TableHTMLAttributes,
  type TdHTMLAttributes,
  type ThHTMLAttributes,
} from "react";

import { cx } from "../internal/cx";
import { Button, IconButton, Input, Text } from "../primitives";

export type DataTableProps = TableHTMLAttributes<HTMLTableElement> & {
  minWidth?: string | number;
  density?: "regular" | "compact";
  stickyHeader?: boolean;
  state?: ReactNode;
  containerClassName?: string;
};

export function DataTable({
  minWidth,
  density = "regular",
  stickyHeader = false,
  state,
  className,
  containerClassName,
  style,
  children,
  ...props
}: DataTableProps) {
  return (
    <div
      className={cx("ui-table-surface", containerClassName)}
      data-table-overflow="horizontal"
      data-density={density}
      data-sticky-header={stickyHeader || undefined}
    >
      {state ?? (
        <div className="ui-table-scroll">
          <table
            className={cx("ui-table", className)}
            style={{ minWidth, ...style } as CSSProperties}
            {...props}
          >
            {children}
          </table>
        </div>
      )}
    </div>
  );
}

export function TableHeader(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...props} />;
}

export function TableBody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}

export function TableRow({ selected, className, ...props }: HTMLAttributes<HTMLTableRowElement> & { selected?: boolean }) {
  return <tr className={cx(className)} data-selected={selected || undefined} {...props} />;
}

export type SortDirection = "asc" | "desc";

export type TableHeadProps = Omit<ThHTMLAttributes<HTMLTableCellElement>, "align"> & {
  align?: "start" | "center" | "end";
  /** Render the column label as a sort control. */
  sortable?: boolean;
  /** This column's current direction, or null when another column is sorted. */
  sortDirection?: SortDirection | null;
  /** Receives the direction the app should apply next. The engine never compares values. */
  onSortChange?: (direction: SortDirection) => void;
  /** Accessible suffix for the control, e.g. "Name, sort ascending". */
  sortLabel?: (direction: SortDirection) => string;
};

/**
 * Column header. With `sortable`, the engine owns the affordance only — the
 * control, the direction indicator, `aria-sort`, keyboard and focus. Comparing
 * values stays with the app, which knows that a date is not its label and that
 * an amount is not its formatted string.
 */
export function TableHead({
  align = "start",
  sortable = false,
  sortDirection = null,
  onSortChange,
  sortLabel,
  children,
  className,
  ...props
}: TableHeadProps) {
  const ariaSort = !sortable
    ? undefined
    : sortDirection === "asc"
      ? "ascending"
      : sortDirection === "desc"
        ? "descending"
        : "none";

  if (!sortable) {
    return (
      <th className={cx(className)} data-align={align} scope="col" {...props}>
        {children}
      </th>
    );
  }

  const next: SortDirection = sortDirection === "asc" ? "desc" : "asc";
  const Indicator = sortDirection === "asc" ? ChevronUp : sortDirection === "desc" ? ChevronDown : ChevronsUpDown;

  return (
    <th className={cx(className)} data-align={align} scope="col" aria-sort={ariaSort} {...props}>
      <button
        type="button"
        className="ui-table-sort"
        data-active={sortDirection ? true : undefined}
        aria-label={sortLabel?.(next)}
        onClick={() => onSortChange?.(next)}
      >
        <span>{children}</span>
        <Indicator aria-hidden="true" />
      </button>
    </th>
  );
}

export function TableCell({
  align = "start",
  wrap = false,
  className,
  ...props
}: Omit<TdHTMLAttributes<HTMLTableCellElement>, "align"> & {
  align?: "start" | "center" | "end";
  /** Allow prose in this cell to wrap instead of forcing a single operational line. */
  wrap?: boolean;
}) {
  return <td className={cx(className)} data-align={align} data-wrap={wrap || undefined} {...props} />;
}

export type TableCellContentProps = HTMLAttributes<HTMLDivElement> & {
  primary: ReactNode;
  secondary?: ReactNode;
  align?: "start" | "center" | "end";
  /** Maximum visible lines for the primary value before truncation. */
  primaryLines?: 1 | 2;
};

/**
 * Intentional two-tier table content. Use this instead of inserting manual line
 * breaks so row height, muted metadata, wrapping and numeric alignment remain
 * consistent across applications.
 */
export function TableCellContent({
  primary,
  secondary,
  align = "start",
  primaryLines = 1,
  className,
  ...props
}: TableCellContentProps) {
  return (
    <div
      className={cx("ui-table-cell-content", className)}
      data-align={align}
      data-primary-lines={primaryLines}
      {...props}
    >
      <span className="ui-table-cell-primary">{primary}</span>
      {secondary ? <span className="ui-table-cell-secondary">{secondary}</span> : null}
    </div>
  );
}

export type TableToolbarProps = HTMLAttributes<HTMLDivElement> & {
  search?: ReactNode;
  filters?: ReactNode;
  actions?: ReactNode;
};

export function TableToolbar({ search, filters, actions, className, children, ...props }: TableToolbarProps) {
  return (
    <div className={cx("ui-table-toolbar", className)} {...props}>
      <div className="ui-table-toolbar-main">
        {search}
        {filters}
        {children}
      </div>
      {actions ? <div className="ui-table-toolbar-actions">{actions}</div> : null}
    </div>
  );
}

export type SearchFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label?: string;
  onClear?: () => void;
};

export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  { label = "Search", onClear, className, value, ...props },
  ref,
) {
  const hasValue = typeof value === "string" && value.length > 0;
  return (
    <div className={cx("ui-search-field", className)}>
      <Search aria-hidden="true" />
      <Input ref={ref} type="search" aria-label={label} value={value} {...props} />
      {onClear && hasValue ? (
        <IconButton
          size="sm"
          variant="ghost"
          label={`Clear ${label.toLowerCase()}`}
          icon={<X aria-hidden="true" />}
          onClick={onClear}
        />
      ) : null}
    </div>
  );
});

export type PaginationProps = HTMLAttributes<HTMLElement> & {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  label?: string;
};

export function Pagination({
  page,
  pageCount,
  onPageChange,
  label = "Pagination",
  className,
  ...props
}: PaginationProps) {
  const safePageCount = Math.max(1, pageCount);
  const safePage = Math.min(Math.max(1, page), safePageCount);
  return (
    <nav className={cx("ui-pagination", className)} aria-label={label} {...props}>
      <Text tone="secondary" size="sm">Page {safePage} of {safePageCount}</Text>
      <div className="ui-pagination-actions">
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={<ChevronLeft aria-hidden="true" />}
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
        >
          Previous
        </Button>
        <Button
          size="sm"
          variant="secondary"
          trailingIcon={<ChevronRight aria-hidden="true" />}
          disabled={safePage >= safePageCount}
          onClick={() => onPageChange(safePage + 1)}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}

export type DescriptionListProps = HTMLAttributes<HTMLDListElement> & {
  /** Pair columns. Use 1 in narrow containers such as a detail aside. */
  columns?: 1 | 2;
};

export function DescriptionList({ columns = 2, className, ...props }: DescriptionListProps) {
  return <dl className={cx("ui-description-list", className)} data-columns={columns} {...props} />;
}

export type DescriptionItemProps = HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  children: ReactNode;
};

export function DescriptionItem({ label, children, className, ...props }: DescriptionItemProps) {
  return (
    <div className={cx("ui-description-item", className)} {...props}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
