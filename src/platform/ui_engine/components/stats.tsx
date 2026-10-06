import Link from "next/link";
import { type ReactNode } from "react";

import { cx } from "../internal/cx";
import { MetricValue, Text } from "../primitives";

export function StatCard({ label, value, caption, icon, href, className }: { label: ReactNode; value: ReactNode; caption: ReactNode; icon?: ReactNode; href?: string; className?: string }) {
  const content = <div className={cx("flex h-full min-w-0 flex-col gap-2 rounded-card bg-surface p-(--ui-section-px) shadow-plane transition-shadow", href && "hover:bg-surface-muted hover:shadow-raise focus-within:shadow-raise", className)}>
    <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-ink-secondary">{icon ? <span className="grid h-8 w-8 shrink-0 place-items-center rounded-pill bg-surface-muted text-ink-secondary [&_svg]:h-4 [&_svg]:w-4" aria-hidden="true">{icon}</span> : null}<span className="truncate">{label}</span></div>
    <MetricValue size="lg">{value}</MetricValue>
    <Text as="p" tone="tertiary" size="sm" className="mt-auto">{caption}</Text>
  </div>;
  return href ? <Link href={href} className="min-w-0 text-inherit no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus">{content}</Link> : content;
}

export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("grid grid-cols-2 gap-3 min-[840px]:grid-cols-4 max-[400px]:grid-cols-1", className)}>{children}</div>;
}
