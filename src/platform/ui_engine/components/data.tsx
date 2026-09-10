"use client";

import { ChevronDown,ChevronUp,ChevronsUpDown,Search,X } from "lucide-react";
import Link from "next/link";
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
import type { SemanticTone } from "../primitives";
import { StatusMarker } from "./feedback";
import { IconButton,Input,Text } from "../primitives";

export type DataTableProps = TableHTMLAttributes<HTMLTableElement> & {
  framed?: boolean;
  minWidth?: string | number;
  density?: "regular" | "compact";
  stickyHeader?: boolean;
  /**
   * Caps the scrolling body, e.g. `"60vh"`. A sticky header needs a scroll
   * container that actually scrolls; without a bound the table simply grows and
   * the header has nothing to stick to. Required for `stickyHeader` to do
   * anything, so the two are supplied together.
   */
  maxBodyHeight?: string | number;
  state?: ReactNode;
  containerClassName?: string;
  /**
   * When true the table scroll container grows to fill the available flex space
   * instead of being capped at a fixed height. Requires the parent chain to be
   * `flex flex-col` with a bounded height. Supersedes `maxBodyHeight` — do not
   * combine both.
   */
  fill?: boolean;
};

export function DataTable({
  minWidth,
  framed = true,
  density = "regular",
  stickyHeader = false,
  maxBodyHeight,
  state,
  fill = false,
  className,
  containerClassName,
  style,
  children,
  ...props
}: DataTableProps) {
  const scrolls = fill || maxBodyHeight !== undefined;
  return (
    <div
      className={cx(
        "overflow-hidden bg-surface",
        fill && "flex flex-col flex-1 min-h-0",
        framed && "rounded-card border border-line",
        density === "compact" && "[--ui-th-height:32px] [--ui-th-py:6px] [--ui-td-py:7px]",
        stickyHeader && "[--ui-thead-position:sticky]",
        containerClassName,
      )}
      data-table-overflow="horizontal"
      data-density={density}
      data-sticky-header={stickyHeader || undefined}
    >
      {state ?? (
        <div
          className={cx("overflow-x-auto", scrolls && "overflow-y-auto", fill && "flex-1 min-h-0")}
          style={!fill && scrolls && maxBodyHeight !== undefined ? ({ maxHeight: maxBodyHeight } as CSSProperties) : undefined}
        >
          <table
            className={cx("w-full border-separate border-spacing-0 text-left tabular-nums", className)}
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

export function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cx("[position:var(--ui-thead-position,static)] top-0 z-[1]", className)}
      {...props}
    />
  );
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cx("[&>tr:last-child>td]:border-b-0", className)} {...props} />;
}

export function TableRow({ selected, className, ...props }: HTMLAttributes<HTMLTableRowElement> & { selected?: boolean }) {
  return (
    <tr
      className={cx(
        selected
          ? "bg-surface-muted [--ui-row-marker:var(--ui-action-primary)]"
          : "hover:bg-[color-mix(in_srgb,var(--ui-surface-muted)_75%,transparent)]",
        className,
      )}
      data-selected={selected || undefined}
      {...props}
    />
  );
}

export type SortDirection = "asc" | "desc";

export type TableHeadProps = Omit<ThHTMLAttributes<HTMLTableCellElement>, "align"> & {
  stickyEnd?: boolean;
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

const TABLE_ALIGN_CLASSES: Record<"start" | "center" | "end", string> = {
  start: "text-left",
  center: "text-center",
  end: "text-right tabular-nums",
};

const IDENTIFIER_CLASSES = "text-ink-secondary font-ui-mono text-[0.8125rem] tracking-[-0.01em]";

function isIdentifierColumn(props: Record<string, unknown>): boolean {
  return props["data-column"] === "identifier";
}

/**
 * Column header. With `sortable`, the engine owns the affordance only — the
 * control, the direction indicator, `aria-sort`, keyboard and focus. Comparing
 * values stays with the app, which knows that a date is not its label and that
 * an amount is not its formatted string.
 */
export function TableHead({
  stickyEnd = false,
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

  const identifier = isIdentifierColumn(props as Record<string, unknown>);
  const headClasses = cx(
    "h-(--ui-th-height,36px) border-b border-line-strong bg-thead-surface px-3 py-(--ui-th-py,8px) align-middle font-semibold uppercase",
    identifier ? IDENTIFIER_CLASSES + " uppercase" : "text-thead text-[0.6875rem] tracking-[0.08em]",
    TABLE_ALIGN_CLASSES[align],
    stickyEnd && "sticky right-0 z-[2] border-l border-l-line",
    className,
  );

  if (!sortable) {
    return (
      <th className={headClasses} data-align={align} scope="col" {...props}>
        {children}
      </th>
    );
  }

  const next: SortDirection = sortDirection === "asc" ? "desc" : "asc";
  const Indicator = sortDirection === "asc" ? ChevronUp : sortDirection === "desc" ? ChevronDown : ChevronsUpDown;

  return (
    <th className={headClasses} data-align={align} scope="col" aria-sort={ariaSort} {...props}>
      <button
        type="button"
        /* Sort control. The engine renders the affordance; the app does the comparing. */
        className="group inline-flex cursor-pointer items-center gap-[5px] border-0 bg-[transparent] p-0 font-[inherit] text-[inherit] [letter-spacing:inherit] [text-transform:inherit] focus-visible:rounded-[2px] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-line-focus"
        data-active={sortDirection ? true : undefined}
        aria-label={sortLabel?.(next)}
        onClick={() => onSortChange?.(next)}
      >
        <span>{children}</span>
        <Indicator
          aria-hidden="true"
          className={cx(
            "h-[13px] w-[13px] shrink-0 transition-opacity duration-[120ms] motion-reduce:transition-none",
            sortDirection ? "opacity-100" : "opacity-40 group-hover:opacity-85",
          )}
        />
      </button>
    </th>
  );
}

/** Canonical sticky actions column header for entity directories. */
export function RowActionsHead() {
  return <TableHead stickyEnd align="center" style={{ width: 48 }}>Actions</TableHead>;
}

export function TableCell({
  stickyEnd = false,
  align = "start",
  wrap = false,
  className,
  ...props
}: Omit<TdHTMLAttributes<HTMLTableCellElement>, "align"> & {
  align?: "start" | "center" | "end";
  /** Allow prose in this cell to wrap instead of forcing a single operational line. */
  wrap?: boolean;
  stickyEnd?: boolean;
}) {
  const identifier = isIdentifierColumn(props as Record<string, unknown>);
  return (
    <td
      className={cx(
        "border-b border-line-subtle px-3 py-(--ui-td-py,10px) align-middle whitespace-nowrap first:shadow-[inset_3px_0_0_var(--ui-row-marker,transparent)]",
        identifier && IDENTIFIER_CLASSES,
        TABLE_ALIGN_CLASSES[align],
        wrap && "whitespace-normal",
        stickyEnd && "sticky right-0 z-[1] border-l border-l-line bg-surface",
        className,
      )}
      data-align={align}
      data-wrap={wrap || undefined}
      {...props}
    />
  );
}

/** Canonical sticky actions cell for entity directories. */
export function RowActionsCell({ children }: { children: ReactNode }) {
  return <TableCell stickyEnd align="center" className="py-1.5">{children}</TableCell>;
}

export type TableCellContentProps = HTMLAttributes<HTMLDivElement> & {
  primary: ReactNode;
  secondary?: ReactNode;
  align?: "start" | "center" | "end";
  /** Maximum visible lines for the primary value before truncation. */
  primaryLines?: 1 | 2;
};

const CELL_CONTENT_ALIGN_CLASSES: Record<"start" | "center" | "end", string> = {
  start: "",
  center: "justify-items-center text-center",
  end: "justify-items-end text-right",
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
      className={cx("grid min-w-0 gap-0.5 leading-[1.3]", CELL_CONTENT_ALIGN_CLASSES[align], className)}
      data-align={align}
      data-primary-lines={primaryLines}
      {...props}
    >
      <span
        className={cx(
          "min-w-0 overflow-hidden wrap-anywhere",
          primaryLines === 2 ? "line-clamp-2" : "line-clamp-1",
        )}
      >
        {primary}
      </span>
      {secondary ? <span className="text-ink-tertiary text-xs leading-[1.25] whitespace-normal">{secondary}</span> : null}
    </div>
  );
}

export type EntityPrimaryCellProps = {
  /** Semantic tone for the status dot; applications choose the final domain mapping explicitly. */
  tone: SemanticTone;
  /** Accessible label for the status dot — shown as tooltip and read by screen readers */
  statusLabel: string;
  /** Primary entity name */
  name: ReactNode;
  /** Optional secondary metadata: slug, code, type, or descriptor */
  secondary?: ReactNode;
};

/**
 * Canonical first-column cell for entity directory tables.
 * Composes: ● (status dot) + name (bold) + secondary metadata.
 * Rule: status lives in the dot color — no dedicated Status column.
 * Use this instead of inline `<StatusMarker>` + `<TableCellContent>` composition.
 */
export function EntityPrimaryCell({ tone, statusLabel, name, secondary }: EntityPrimaryCellProps) {
  return (
    <TableCellContent
      primary={
        <span className="inline-flex min-w-0 items-center gap-2">
          <StatusMarker tone={tone} label={statusLabel} className="shrink-0" />
          <strong className="min-w-0 truncate font-semibold">{name}</strong>
        </span>
      }
      secondary={secondary}
      primaryLines={1}
    />
  );
}

export type TableToolbarProps = HTMLAttributes<HTMLDivElement> & {
  framed?: boolean;
  search?: ReactNode;
  filters?: ReactNode;
  actions?: ReactNode;
};

export function TableToolbar({ framed = true, search, filters, actions, className, children, ...props }: TableToolbarProps) {
  return (
    <div
      className={cx(
        "flex min-h-[52px] items-center justify-between gap-3 bg-surface p-2 max-[720px]:flex-col max-[720px]:items-stretch",
        framed && "rounded-card border border-line",
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        {search}
        {filters}
        {children}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 max-[720px]:justify-start">{actions}</div> : null}
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
    <div className={cx("relative w-[min(100%,260px)] max-[720px]:w-full", className)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-2.5 top-1/2 z-[1] h-[15px] w-[15px] -translate-y-1/2 text-ink-tertiary"
      />
      <Input
        ref={ref}
        type="search"
        aria-label={label}
        value={value}
        className="pl-8 pr-[34px] [&::-webkit-search-cancel-button]:appearance-none"
        {...props}
      />
      {onClear && hasValue ? (
        <IconButton
          size="sm"
          variant="ghost"
          label={`Clear ${label.toLowerCase()}`}
          icon={<X aria-hidden="true" />}
          onClick={onClear}
          className="absolute right-0.5 top-0.5"
        />
      ) : null}
    </div>
  );
});

export type DescriptionListProps = HTMLAttributes<HTMLDListElement> & {
  /** Pair columns. Use 1 in narrow containers such as a detail aside. */
  columns?: 1 | 2;
};

export function DescriptionList({ columns = 2, className, ...props }: DescriptionListProps) {
  return (
    <dl
      className={cx(
        "m-0 grid gap-x-6",
        columns === 1 ? "grid-cols-1" : "grid-cols-2 max-[720px]:grid-cols-1",
        className,
      )}
      data-columns={columns}
      {...props}
    />
  );
}

export type DescriptionItemProps = HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  children: ReactNode;
};

export function DescriptionItem({ label, children, className, ...props }: DescriptionItemProps) {
  return (
    <div
      className={cx(
        "grid grid-cols-[minmax(110px,0.55fr)_minmax(0,1fr)] gap-3 border-b border-line-subtle py-[9px] [&_dt]:text-ink-secondary [&_dd]:m-0 [&_dd]:min-w-0 [&_dd]:text-ink [&_dd]:font-medium [&_dd]:wrap-anywhere [&_dd]:tabular-nums",
        className,
      )}
      {...props}
    >
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
