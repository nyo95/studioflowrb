"use client";

import { createContext, useContext, useEffect, useState, type AnchorHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { cx } from "../internal/cx";
import { getEffectiveRailCollapsed } from "../internal/rail-state";
import { Heading, Text } from "../primitives";
import { IconButton } from "../primitives";
import { Tooltip } from "./overlays";

const RailContext = createContext<{ collapsed: boolean }>({ collapsed: false });

function useNarrowNavigation(): boolean {
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 840px)");
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return narrow;
}

export type AppShellProps = {
  brand: ReactNode;
  navigation: ReactNode;
  utility?: ReactNode;
  topbar?: ReactNode;
  children: ReactNode;
  navigationLabel?: string;
  className?: string;
  /** Show the rail collapse control. Off by default so existing shells are unchanged. */
  collapsible?: boolean;
  /** Controlled collapsed state. Omit to let the shell manage it. */
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  /** Compact mark rendered in place of `brand` while collapsed. Falls back to `brand`. */
  collapsedBrand?: ReactNode;
  expandLabel?: string;
  collapseLabel?: string;
};

export function AppShell({
  brand,
  navigation,
  utility,
  topbar,
  children,
  navigationLabel = "Application navigation",
  className,
  collapsible = false,
  collapsed,
  defaultCollapsed = false,
  onCollapsedChange,
  collapsedBrand,
  expandLabel = "Expand navigation",
  collapseLabel = "Collapse navigation",
}: AppShellProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
  const narrowNavigation = useNarrowNavigation();
  const storedCollapsed = collapsed ?? internalCollapsed;
  // Narrow layouts always retain visible labels. The desktop preference remains
  // untouched and returns when the viewport widens again.
  const isCollapsed = getEffectiveRailCollapsed(collapsible, narrowNavigation, storedCollapsed);

  const toggle = () => {
    const next = !isCollapsed;
    if (collapsed === undefined) setInternalCollapsed(next);
    onCollapsedChange?.(next);
  };

  return (
    <RailContext.Provider value={{ collapsed: isCollapsed }}>
    <div className={cx("ui-app-shell", className)} data-collapsed={isCollapsed || undefined}>
      <aside className="ui-app-rail" aria-label={navigationLabel} data-collapsed={isCollapsed || undefined}>
        <div className="ui-app-brand">
          <div className="ui-app-brand-mark">{isCollapsed ? (collapsedBrand ?? brand) : brand}</div>
          {collapsible && !narrowNavigation ? (
            <IconButton
              className="ui-app-rail-toggle"
              size="sm"
              variant="ghost"
              label={isCollapsed ? expandLabel : collapseLabel}
              aria-expanded={!isCollapsed}
              onClick={toggle}
              icon={isCollapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
            />
          ) : null}
        </div>
        <nav className="ui-app-nav">{navigation}</nav>
        {utility ? <div className="ui-app-utility">{utility}</div> : null}
      </aside>
      <div className="ui-app-viewport">
        {topbar ? <header className="ui-app-topbar">{topbar}</header> : null}
        <main className="ui-app-content">{children}</main>
      </div>
    </div>
    </RailContext.Provider>
  );
}

export type NavItemProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children"> & {
  icon?: ReactNode;
  /** Marks the current location. Sets aria-current="page". */
  active?: boolean;
  children: ReactNode;
};

/**
 * A single navigation entry. Owned by the engine rather than each app so that
 * "where am I" looks and announces the same in every StudioFlow surface.
 * When the rail is collapsed the label is hidden visually but kept for assistive
 * tech, and a tooltip restores it for sighted users.
 */
export function NavItem({ icon, active = false, children, className, ...props }: NavItemProps) {
  const { collapsed } = useContext(RailContext);

  const item = (
    <a
      className={cx("ui-nav-item", className)}
      data-active={active || undefined}
      aria-current={active ? "page" : undefined}
      {...props}
    >
      {icon ? <span className="ui-nav-icon" aria-hidden="true">{icon}</span> : null}
      <span className="ui-nav-label">{children}</span>
    </a>
  );

  return collapsed ? <Tooltip content={children} side="right">{item}</Tooltip> : item;
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
