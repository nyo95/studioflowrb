"use client";

import { Filter, MoreHorizontal, X } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { Fragment, type HTMLAttributes, type ReactNode } from "react";

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
        <DropdownMenu.Content
          className="z-[65] min-w-[190px] overflow-hidden rounded-control border border-line bg-surface-raised shadow-elevated p-[5px]"
          sideOffset={5}
          align="end"
        >
          {items.map((item) => (
            <Fragment key={item.label}>
              {item.separatorBefore ? (
                <DropdownMenu.Separator className="-mx-px my-1 h-px bg-line" />
              ) : null}
              <DropdownMenu.Item
                className="flex min-h-8 cursor-pointer items-center gap-2 rounded-action px-2 py-1.5 text-[0.8125rem] text-ink outline-0 [&_svg]:h-[15px] [&_svg]:w-[15px] [&_svg]:text-ink-tertiary data-[danger=true]:text-danger data-[disabled]:pointer-events-none data-[disabled]:opacity-45 data-[highlighted]:bg-surface-muted"
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
    <div
      className={cx(
        "inline-flex min-h-(--ui-control-height-md) items-center gap-2 rounded-control border bg-surface py-[3px] pl-2.5 pr-1",
        active ? "border-line-strong" : "border-line",
        className,
      )}
      data-active={active || undefined}
      {...props}
    >
      <Filter aria-hidden="true" className="h-[15px] w-[15px] text-ink-tertiary" />
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
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
  variant = "bar",
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  count: number;
  label?: (count: number) => ReactNode;
  /** `inline` composes selection state inside a table toolbar. */
  variant?: "bar" | "inline";
}) {
  return (
    <div
      className={cx(
        "flex items-center justify-between rounded-control",
        variant === "inline"
          ? "min-h-[34px] gap-2 border border-line bg-surface-muted py-0 pl-2.5 pr-[3px] [&>strong]:whitespace-nowrap [&>strong]:text-xs"
          : "min-h-[44px] gap-3 border border-line-strong bg-surface-muted py-1.5 pl-3 pr-2",
        className,
      )}
      data-variant={variant}
      role="status"
      {...props}
    >
      <strong>{label ? label(count) : `${count} selected`}</strong>
      <div className="flex items-center gap-1.5">{children}</div>
    </div>
  );
}

