"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { cx } from "../internal/cx";

export type PillTabItem = {
  key: string;
  label: string;
  icon?: ReactNode;
  count?: ReactNode;
  active: boolean;
  href?: string;
  onSelect?: () => void;
  /** Shown but not selectable (for example a view the viewer may not open). */
  disabled?: boolean;
  /** Why the item is disabled; shown as its tooltip. */
  disabledReason?: string;
};

/** Sibling page views, rendered as links or local controls without changing their meaning. */
export function PillTabs({ items, label = "Page views", className, actions }: { items: readonly PillTabItem[]; label?: string; className?: string; /** Page-level actions at the bar's right end (for example "New price"). */ actions?: ReactNode }) {
  const links = items.some((item) => item.href) && items.every((item) => item.href || item.disabled);
  const content = items.map((item) => {
    const body = <>{item.icon ? <span aria-hidden="true" className="shrink-0 [&_svg]:h-4 [&_svg]:w-4">{item.icon}</span> : null}<span className={cx("whitespace-nowrap", !item.active && Boolean(item.icon) && "max-[560px]:sr-only")}>{item.label}</span>{item.count !== undefined ? <span className="font-ui-mono text-[11px] tabular-nums opacity-80">{item.count}</span> : null}</>;
    // One colour class per state: two text colours on one element resolve by stylesheet order, not class order.
    const base = "inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-pill px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus";
    if (item.disabled) {
      const disabledClass = cx(base, "cursor-not-allowed font-medium text-ink-tertiary opacity-60");
      return links
        ? <span key={item.key} aria-disabled="true" title={item.disabledReason ?? item.label} className={disabledClass}>{body}</span>
        : <button key={item.key} type="button" aria-disabled="true" aria-pressed={false} title={item.disabledReason ?? item.label} className={disabledClass}>{body}</button>;
    }
    const className = cx(base, item.active ? "bg-action font-semibold text-action-ink" : "font-medium text-ink-secondary hover:bg-surface-muted hover:text-ink");
    return item.href ? <Link key={item.key} href={item.href} prefetch={false} aria-current={item.active ? "page" : undefined} title={!item.active && item.icon ? item.label : undefined} className={className}>{body}</Link> : <button key={item.key} type="button" onClick={item.onSelect} aria-pressed={item.active} title={!item.active && item.icon ? item.label : undefined} className={className}>{body}</button>;
  });
  const inner = <div className={cx("flex min-w-0 max-w-full gap-1 overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}>{content}</div>;
  const frame = "max-w-full rounded-pill border border-line-subtle bg-surface shadow-float";
  const bar = links ? <nav aria-label={label} className={frame}>{inner}</nav> : <div role="group" aria-label={label} className={frame}>{inner}</div>;
  return actions ? <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">{bar}<div className="flex shrink-0 items-center gap-2">{actions}</div></div> : bar;
}

export type PillTabPanel = { value: string; label: string; count?: ReactNode; icon?: ReactNode; disabled?: boolean; disabledReason?: string; content: ReactNode };

/**
 * `PillTabs` that also switches the page content in place, for views with no address of their own.
 * Controlled with `value`/`onValueChange` or uncontrolled with `defaultValue` (the first enabled view by default).
 * Inactive panels are not mounted. `fill` grows the active panel through a bounded flex parent.
 */
export function PillTabPanels({ items, value, defaultValue, onValueChange, label, actions, fill = false }: { items: readonly PillTabPanel[]; value?: string; defaultValue?: string; onValueChange?: (value: string) => void; label?: string; actions?: ReactNode; fill?: boolean }) {
  const [local, setLocal] = useState(defaultValue ?? items.find((item) => !item.disabled)?.value);
  const current = value ?? local;
  const select = (next: string) => { setLocal(next); onValueChange?.(next); };
  const panel = items.find((item) => item.value === current);
  return (
    <div className={cx("flex min-w-0 flex-col gap-4", fill && "min-h-0 flex-1")}>
      <PillTabs label={label} actions={actions} items={items.map((item) => ({ key: item.value, label: item.label, count: item.count, icon: item.icon, disabled: item.disabled, disabledReason: item.disabledReason, active: item.value === current, onSelect: () => select(item.value) }))} />
      {panel ? <div className={cx(fill && "flex min-h-0 flex-1 flex-col")}>{panel.content}</div> : null}
    </div>
  );
}
