"use client";

import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
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

export function TableHead({
  align = "start",
  className,
  ...props
}: Omit<ThHTMLAttributes<HTMLTableCellElement>, "align"> & { align?: "start" | "center" | "end" }) {
  return <th className={cx(className)} data-align={align} scope="col" {...props} />;
}

export function TableCell({
  align = "start",
  className,
  ...props
}: Omit<TdHTMLAttributes<HTMLTableCellElement>, "align"> & { align?: "start" | "center" | "end" }) {
  return <td className={cx(className)} data-align={align} {...props} />;
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

export function DescriptionList({ className, ...props }: HTMLAttributes<HTMLDListElement>) {
  return <dl className={cx("ui-description-list", className)} {...props} />;
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
