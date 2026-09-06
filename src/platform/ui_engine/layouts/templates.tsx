"use client";

import { Tabs as RTabs } from "radix-ui";
import type { HTMLAttributes,ReactNode } from "react";

import { cx } from "../internal/cx";

export function DirectoryShell({
  header,
  toolbar,
  pagination,
  surface = false,
  fill = false,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  header?: ReactNode;
  surface?: boolean;
  /** When true the shell grows to fill its flex parent (flex:1 min-h-0) and the
   *  inner content area also fills, enabling viewport-tall tables without magic heights. */
  fill?: boolean;
  toolbar?: ReactNode;
  pagination?: ReactNode;
}) {
  return (
    <div className={cx("grid gap-4", fill && "flex flex-col flex-1 min-h-0", className)} {...props}>
      {header}
      {surface ? <div className={cx("min-w-0 overflow-hidden rounded-card border border-line bg-surface", fill && "flex flex-col flex-1 min-h-0")} data-directory-surface>
        {toolbar ? <div className="border-b border-line">{toolbar}</div> : null}
        <div className={cx("min-w-0", fill && "flex-1 min-h-0")}>{children}</div>
        {pagination ? <div className="border-t border-line px-4 py-3">{pagination}</div> : null}
      </div> : <>{toolbar}<div className={cx("min-w-0", fill && "flex-1 min-h-0")}>{children}</div>{pagination}</>}
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
  distribution?: "scroll" | "equal";
  /** Slot rendered to the right of the tab strip — use for page-level actions (e.g. "New price"). */
  actions?: ReactNode;
  /** Keep tab panels in the DOM when switching is part of one multi-panel form. */
  keepMounted?: boolean;
  className?: string;
};

export function Tabs({ items, label = "Sections", distribution = "scroll", className, defaultValue, actions, keepMounted = false, ...props }: TabsProps) {
  const fallbackValue = items.find((item) => !item.disabled)?.value;
  return (
    <RTabs.Root className={cx("min-w-0", className)} defaultValue={defaultValue ?? fallbackValue} {...props}>
      <div className="flex min-w-0 items-center border-b border-line">
        <RTabs.List
          className={cx(
            "min-w-0 flex-1 gap-0.5",
            distribution === "equal"
              ? "grid overflow-hidden max-[560px]:flex max-[560px]:overflow-x-auto max-[560px]:[scrollbar-width:none] max-[560px]:[&::-webkit-scrollbar]:hidden [&>[role=tab]]:min-w-0 [&>[role=tab]]:whitespace-normal [&>[role=tab]]:leading-tight max-[560px]:[&>[role=tab]]:min-w-fit max-[560px]:[&>[role=tab]]:shrink-0 max-[560px]:[&>[role=tab]]:whitespace-nowrap"
              : "flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          )}
          style={distribution === "equal" ? { gridTemplateColumns: `repeat(${Math.max(items.length, 1)}, minmax(0, 1fr))` } : undefined}
          aria-label={label}
        >
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
        {actions ? (
          <div className="flex shrink-0 items-center gap-2 px-3 py-1.5">
            {actions}
          </div>
        ) : null}
      </div>
      {items.map((item) => (
        <RTabs.Content className="pt-4" value={item.value} key={item.value} forceMount={keepMounted || undefined}>
          {item.content}
        </RTabs.Content>
      ))}
    </RTabs.Root>
  );
}
