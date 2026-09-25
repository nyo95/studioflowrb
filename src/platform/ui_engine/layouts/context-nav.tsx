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
  /**
   * Which ground this column sits on. `rail` is recessed chrome, so the active
   * item lifts off it as a white plane. `plane` is already a content surface,
   * where a white card would be invisible, so it takes a muted fill instead.
   */
  surface?: "plane" | "rail";
};

/**
 * One link in a side navigation column (SettingsShell `navigation` slot, or a
 * record workspace such as a StudioFlow project). A plain anchor keeps the
 * engine router-agnostic (pass `component={Link}` for client routing); the
 * active state is decided by the consumer.
 */
export function ContextNavLink({ href, active = false, marker, detail, children, className, surface = "plane", component: Anchor = "a" as unknown as ComponentType<AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }>, ...props }: ContextNavLinkProps) {
  return (
    <Anchor
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "flex items-center gap-2 no-underline transition-colors",
        surface === "rail"
          ? "min-h-[29px] rounded-action px-2 text-[13px]"
          : "min-h-8 rounded-control px-2.5 py-1.5 text-sm",
        active
          ? surface === "rail"
            ? "bg-surface font-semibold text-ink shadow-plane"
            : "bg-surface-muted font-semibold text-ink"
          : "text-ink-secondary hover:bg-surface-muted hover:text-ink",
        className,
      )}
      {...props}
    >
      {marker ? <span aria-hidden="true" className="inline-flex shrink-0">{marker}</span> : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {detail !== undefined && detail !== null ? <span className="shrink-0 font-ui-mono text-micro text-ink-tertiary tabular-nums">{detail}</span> : null}
    </Anchor>
  );
}

export function ContextNavHeading({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  /* Prototype `.a-railhead`: 10px sans, .11em tracking. It was `text-label`,
     the mono identity utility — right for a data label, too mechanical for a
     rail's section heads. */
  return <div className={cx("px-2 pb-[5px] pt-[9px] text-[10px] font-semibold uppercase leading-[1.2] tracking-[0.11em] text-ink-tertiary first:pt-0.5", className)} {...props}>{children}</div>;
}
