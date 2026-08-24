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
    <div className={cx("ui-directory-shell", className)} {...props}>
      {header}
      {toolbar}
      <div className="ui-directory-content">{children}</div>
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
    <div className={cx("ui-detail-shell", className)} {...props}>
      <div className="ui-detail-header">{header}</div>
      <div className="ui-detail-body">
        <div className="ui-detail-main">{children}</div>
        {aside ? <aside className="ui-detail-aside">{aside}</aside> : null}
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
    <div className={cx("ui-settings-shell", className)} {...props}>
      <nav className="ui-settings-nav" aria-label={navigationLabel}>{navigation}</nav>
      <div className="ui-settings-content">{children}</div>
    </div>
  );
}

export function WorkspaceShell({
  toolbar,
  footer,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { toolbar?: ReactNode; footer?: ReactNode }) {
  return (
    <div className={cx("ui-workspace-shell", className)} {...props}>
      {toolbar ? <div className="ui-workspace-toolbar">{toolbar}</div> : null}
      <div className="ui-workspace-content">{children}</div>
      {footer ? <div className="ui-workspace-footer">{footer}</div> : null}
    </div>
  );
}

export function SplitPane({
  primary,
  secondary,
  secondaryWidth = "md",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  primary: ReactNode;
  secondary: ReactNode;
  secondaryWidth?: "sm" | "md" | "lg";
}) {
  return (
    <div className={cx("ui-split-pane", className)} data-secondary-width={secondaryWidth} {...props}>
      <div className="ui-split-primary">{primary}</div>
      <aside className="ui-split-secondary">{secondary}</aside>
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
    <RTabs.Root className={cx("ui-tabs", className)} defaultValue={props.defaultValue ?? fallbackValue} {...props}>
      <RTabs.List className="ui-tabs-list" aria-label={label}>
        {items.map((item) => (
          <RTabs.Trigger
            className="ui-tabs-trigger"
            value={item.value}
            disabled={item.disabled}
            key={item.value}
          >
            {item.label}
          </RTabs.Trigger>
        ))}
      </RTabs.List>
      {items.map((item) => (
        <RTabs.Content className="ui-tabs-content" value={item.value} key={item.value}>
          {item.content}
        </RTabs.Content>
      ))}
    </RTabs.Root>
  );
}
