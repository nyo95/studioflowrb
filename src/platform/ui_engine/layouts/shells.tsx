import type { HTMLAttributes, ReactNode } from "react";

import { cx } from "../internal/cx";
import { Heading, Text } from "../primitives";

export type AppShellProps = {
  brand: ReactNode;
  navigation: ReactNode;
  utility?: ReactNode;
  topbar?: ReactNode;
  children: ReactNode;
  navigationLabel?: string;
  className?: string;
};

export function AppShell({
  brand,
  navigation,
  utility,
  topbar,
  children,
  navigationLabel = "Application navigation",
  className,
}: AppShellProps) {
  return (
    <div className={cx("ui-app-shell", className)}>
      <aside className="ui-app-rail" aria-label={navigationLabel}>
        <div className="ui-app-brand">{brand}</div>
        <nav className="ui-app-nav">{navigation}</nav>
        {utility ? <div className="ui-app-utility">{utility}</div> : null}
      </aside>
      <div className="ui-app-viewport">
        {topbar ? <header className="ui-app-topbar">{topbar}</header> : null}
        <main className="ui-app-content">{children}</main>
      </div>
    </div>
  );
}

export function PageShell({
  size = "default",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { size?: "default" | "wide" }) {
  return <div className={cx("ui-page-shell", className)} data-size={size} {...props} />;
}

export type PageHeaderProps = HTMLAttributes<HTMLElement> & {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  divider?: boolean;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  meta,
  actions,
  divider = false,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <header className={cx("ui-page-header", className)} data-divider={divider || undefined} {...props}>
      <div className="ui-page-header-copy">
        {eyebrow ? <Text meta>{eyebrow}</Text> : null}
        <Heading level={1}>{title}</Heading>
        {description ? <Text as="p" tone="secondary">{description}</Text> : null}
        {meta ? <div className="ui-page-header-meta">{meta}</div> : null}
      </div>
      {actions ? <div className="ui-page-header-actions">{actions}</div> : null}
    </header>
  );
}
