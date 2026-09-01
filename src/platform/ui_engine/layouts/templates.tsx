"use client";

import { Tabs as RTabs } from "radix-ui";
import type { HTMLAttributes, ReactNode } from "react";

import { cx } from "../internal/cx";

export function DirectoryShell({
  header,
  toolbar,
  pagination,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  header: ReactNode;
  toolbar?: ReactNode;
  pagination?: ReactNode;
}) {
  return (
    <div className={cx("grid gap-4", className)} {...props}>
      {header}
      {toolbar}
      <div className="min-w-0">{children}</div>
      {pagination}
    </div>
  );
}

export function DetailShell({
  header,
  aside,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { header: ReactNode; aside?: ReactNode }) {
  return (
    <div className={cx("grid gap-4", className)} {...props}>
      <div>{header}</div>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(240px,320px)] items-start gap-6 max-[840px]:grid-cols-1">
        <div className="grid min-w-0 gap-4">{children}</div>
        {aside ? <aside className="grid min-w-0 gap-4">{aside}</aside> : null}
      </div>
    </div>
  );
}

export function SettingsShell({
  navigation,
  children,
  navigationLabel = "Settings navigation",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { navigation: ReactNode; navigationLabel?: string }) {
  return (
    <div
      className={cx("grid grid-cols-[minmax(180px,220px)_minmax(0,1fr)] gap-6 max-[840px]:grid-cols-1", className)}
      {...props}
    >
      <nav className="grid content-start gap-1" aria-label={navigationLabel}>{navigation}</nav>
      <div className="grid min-w-0 gap-5">{children}</div>
    </div>
  );
}

export type TabItem = {
  value: string;
  label: ReactNode;
  content: ReactNode;
  disabled?: boolean;
};

export type TabsProps = {
  items: readonly TabItem[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  label?: string;
  className?: string;
};

export function Tabs({ items, label = "Sections", className, ...props }: TabsProps) {
  const fallbackValue = items.find((item) => !item.disabled)?.value;
  return (
    <RTabs.Root className={cx("min-w-0", className)} defaultValue={props.defaultValue ?? fallbackValue} {...props}>
      <RTabs.List className="flex gap-0.5 overflow-x-auto border-b border-line" aria-label={label}>
        {items.map((item) => (
          <RTabs.Trigger
            className="relative min-h-[38px] cursor-pointer whitespace-nowrap border-0 bg-transparent px-3 py-0 font-semibold text-ink-secondary after:absolute after:bottom-[-1px] after:left-2.5 after:right-2.5 after:h-0.5 after:rounded-[2px] after:bg-transparent after:content-[''] data-[state=active]:text-ink data-[state=active]:after:bg-action disabled:opacity-45"
            value={item.value}
            disabled={item.disabled}
            key={item.value}
          >
            {item.label}
          </RTabs.Trigger>
        ))}
      </RTabs.List>
      {items.map((item) => (
        <RTabs.Content className="pt-4" value={item.value} key={item.value}>
          {item.content}
        </RTabs.Content>
      ))}
    </RTabs.Root>
  );
}
