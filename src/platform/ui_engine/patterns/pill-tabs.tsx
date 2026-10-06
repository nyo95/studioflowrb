"use client";

import Link from "next/link";
import { type ReactNode } from "react";

import { cx } from "../internal/cx";

export type PillTabItem = {
  key: string;
  label: string;
  icon?: ReactNode;
  count?: ReactNode;
  active: boolean;
  href?: string;
  onSelect?: () => void;
};

/** Sibling page views, rendered as links or local controls without changing their meaning. */
export function PillTabs({ items, label = "Page views", className }: { items: readonly PillTabItem[]; label?: string; className?: string }) {
  const links = items.every((item) => item.href);
  const content = items.map((item) => {
    const body = <>{item.icon ? <span aria-hidden="true" className="shrink-0 [&_svg]:h-4 [&_svg]:w-4">{item.icon}</span> : null}<span className={cx("whitespace-nowrap", !item.active && Boolean(item.icon) && "max-[560px]:sr-only")}>{item.label}</span>{item.count !== undefined ? <span className="font-ui-mono text-[11px] tabular-nums opacity-80">{item.count}</span> : null}</>;
    // One colour class per state: two text colours on one element resolve by stylesheet order, not class order.
    const className = cx("inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-pill px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus", item.active ? "bg-action font-semibold text-action-ink" : "font-medium text-ink-secondary hover:bg-surface-muted hover:text-ink");
    return item.href ? <Link key={item.key} href={item.href} prefetch={false} aria-current={item.active ? "page" : undefined} title={!item.active && item.icon ? item.label : undefined} className={className}>{body}</Link> : <button key={item.key} type="button" onClick={item.onSelect} aria-pressed={item.active} title={!item.active && item.icon ? item.label : undefined} className={className}>{body}</button>;
  });
  const inner = <div className={cx("flex min-w-0 max-w-full gap-1 overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}>{content}</div>;
  return links ? <nav aria-label={label} className="max-w-full rounded-pill border border-line-subtle bg-surface shadow-float">{inner}</nav> : <div role="group" aria-label={label} className="max-w-full rounded-pill border border-line-subtle bg-surface shadow-float">{inner}</div>;
}
