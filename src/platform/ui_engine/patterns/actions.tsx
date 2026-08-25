"use client";

import { Filter, GripVertical, MoreHorizontal, X } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { Fragment, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";

import { cx } from "../internal/cx";
import { Button, IconButton } from "../primitives";

export type RowActionItem = {
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
};

export function RowActionMenu({
  items,
  label = "Row actions",
}: {
  items: readonly RowActionItem[];
  label?: string;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <IconButton
          size="sm"
          variant="ghost"
          label={label}
          icon={<MoreHorizontal aria-hidden="true" />}
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="ui-menu" sideOffset={5} align="end">
          {items.map((item) => (
            <Fragment key={item.label}>
              {item.separatorBefore ? <DropdownMenu.Separator className="ui-menu-separator" /> : null}
              <DropdownMenu.Item
                className="ui-menu-item"
                data-danger={item.danger || undefined}
                disabled={item.disabled}
                onSelect={item.onSelect}
              >
                {item.icon}
                <span>{item.label}</span>
              </DropdownMenu.Item>
            </Fragment>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function FilterBar({
  active = false,
  onClear,
  clearLabel = "Clear filters",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  active?: boolean;
  onClear?: () => void;
  clearLabel?: string;
}) {
  return (
    <div className={cx("ui-filter-bar", className)} data-active={active || undefined} {...props}>
      <Filter aria-hidden="true" />
      <div className="ui-filter-content">{children}</div>
      {active && onClear ? (
        <Button
          size="sm"
          variant="ghost"
          leadingIcon={<X aria-hidden="true" />}
          onClick={onClear}
        >
          {clearLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function SelectionBar({
  count,
  label,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  count: number;
  label?: (count: number) => ReactNode;
}) {
  return (
    <div className={cx("ui-selection-bar", className)} role="status" {...props}>
      <strong>{label ? label(count) : `${count} selected`}</strong>
      <div className="ui-selection-actions">{children}</div>
    </div>
  );
}

export function ReorderHandle({
  label = "Reorder item",
  className,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & { label?: string }) {
  return (
    <IconButton
      className={cx("ui-reorder-handle", className)}
      size="sm"
      variant="ghost"
      label={label}
      icon={<GripVertical aria-hidden="true" />}
      aria-roledescription="sortable handle"
      {...props}
    />
  );
}
