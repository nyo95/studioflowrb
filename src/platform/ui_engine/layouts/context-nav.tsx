import type { AnchorHTMLAttributes, ComponentType, HTMLAttributes, ReactNode } from "react";

import { cx } from "../internal/cx";

// Deliberately NOT a client module: server components (e.g. platform settings
// navigation) must be able to pass a Link component through `component`.

export type ContextNavLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children"> & {
  href: string;
  active?: boolean;
  /** Leading status marker (e.g. a phase state dot). Decorative; state must also be in the label or `detail`. */
  marker?: ReactNode;
  /** Trailing compact detail such as an open-item count. */
  detail?: ReactNode;
  children: ReactNode;
  /** Link component to render (e.g. Next.js `Link`); defaults to a plain anchor. */
  component?: ComponentType<AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }>;
};

/**
 * One link in a side navigation column (SettingsShell `navigation` slot, or a
 * record workspace such as a StudioFlow project). A plain anchor keeps the
 * engine router-agnostic (pass `component={Link}` for client routing); the
 * active state is decided by the consumer.
 */
export function ContextNavLink({ href, active = false, marker, detail, children, className, component: Anchor = "a" as unknown as ComponentType<AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }>, ...props }: ContextNavLinkProps) {
  return (
    <Anchor
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "flex min-h-8 items-center gap-2 rounded-control px-2.5 py-1.5 text-sm no-underline transition-colors",
        active ? "bg-surface-muted font-semibold text-ink" : "text-ink-secondary hover:bg-surface-muted hover:text-ink",
        className,
      )}
      {...props}
    >
      {marker ? <span aria-hidden="true" className="inline-flex shrink-0">{marker}</span> : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {detail !== undefined && detail !== null ? <span className="shrink-0 font-ui-mono text-[0.6875rem] text-ink-tertiary tabular-nums">{detail}</span> : null}
    </Anchor>
  );
}

export function ContextNavHeading({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("px-2.5 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-ink-tertiary first:pt-0.5", className)} {...props}>{children}</div>;
}
