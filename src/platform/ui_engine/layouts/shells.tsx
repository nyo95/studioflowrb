"use client";

import { createContext, useContext, useEffect, useState, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
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
      <div
        className={cx(
          "grid min-h-screen overflow-x-clip transition-[grid-template-columns] duration-[160ms] motion-reduce:transition-none",
          "grid-cols-[var(--ui-rail-width,232px)_minmax(0,1fr)] max-[840px]:grid-cols-1",
          isCollapsed && "[--ui-rail-width:60px]",
          className,
        )}
        data-collapsed={isCollapsed || undefined}
      >
        {/* The rail is divided from the work area by a drawn rule, not by a tone. It is one
            step stronger than an ordinary border because it separates navigation from work —
            a major division, unlike the hairlines inside a card. */}
        <aside
          className={cx(
            "group sticky top-0 flex h-screen max-w-screen min-w-0 flex-col overflow-hidden border-r border-line",
            "bg-[color-mix(in_srgb,var(--ui-surface-muted)_52%,var(--ui-surface))]",
            "max-[840px]:static max-[840px]:h-auto max-[840px]:border-b max-[840px]:border-r-0",
          )}
          aria-label={navigationLabel}
          data-collapsed={isCollapsed || undefined}
        >
          <div
            className={cx(
              "flex min-h-[72px] items-center justify-between gap-2 px-4 py-3.5 max-[840px]:min-h-[52px]",
              isCollapsed && "flex-col justify-center gap-1.5 px-2 py-2.5",
            )}
          >
            {/* At 60px the mark and the toggle cannot sit side by side, so they stack. */}
            <div className={cx("min-w-0 overflow-hidden", isCollapsed && "grid place-items-center")}>
              {isCollapsed ? (collapsedBrand ?? brand) : brand}
            </div>
            {collapsible && !narrowNavigation ? (
              <IconButton
                className="shrink-0 max-[840px]:hidden"
                size="sm"
                variant="ghost"
                label={isCollapsed ? expandLabel : collapseLabel}
                aria-expanded={!isCollapsed}
                onClick={toggle}
                icon={isCollapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
              />
            ) : null}
          </div>
          <nav
            className={cx(
              "min-w-0 flex-1 overflow-auto px-3 pt-2 pb-3.5",
              isCollapsed && "px-1.5",
              "max-[840px]:flex max-[840px]:overflow-x-auto max-[840px]:p-2.5 max-[840px]:[scrollbar-width:none] max-[840px]:[&::-webkit-scrollbar]:hidden",
            )}
          >
            {navigation}
          </nav>
          {utility ? (
            <div
              className={cx(
                "grid gap-1 border-t border-line px-3 pt-2.5 pb-3.5 max-[840px]:hidden",
                isCollapsed && "px-1.5",
              )}
            >
              {utility}
            </div>
          ) : null}
        </aside>
        <div className="min-w-0">
          {topbar ? (
            <header className="sticky top-0 z-10 flex min-h-16 items-center border-b border-line bg-white/94 backdrop-blur-[12px]">
              {topbar}
            </header>
          ) : null}
          <main className="min-w-0">{children}</main>
        </div>
      </div>
    </RailContext.Provider>
  );
}

export type NavItemProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children"> & {
  icon?: ReactNode;
  /** Marks the current location. Sets aria-current="page". */
  active?: boolean;
  /** An unavailable destination stays visible and disabled with its reason in `title`. */
  disabled?: boolean;
  children?: ReactNode;
};

const NAV_ITEM_BASE_CLASSES =
  "relative flex w-full min-h-[38px] items-center gap-2.5 rounded-control border border-transparent bg-transparent px-2.5 py-2 text-left font-[inherit] text-ink-secondary no-underline";

const NAV_ITEM_STATE_CLASSES = {
  idle: "hover:border-line-subtle hover:bg-white/62 hover:text-ink",
  active:
    "border-line bg-surface text-ink font-semibold " +
    /* Current location. Hover already owns the muted fill, so "active" cannot rely on
       fill alone or the two become indistinguishable. It is marked on three channels
       at once: an ink rule, ink-weight text, and heavier type. */
    "before:absolute before:-left-px before:top-1/2 before:h-[18px] before:w-[3px] before:-translate-y-1/2 before:rounded-r-[2px] before:bg-action before:content-['']",
  disabled: "cursor-not-allowed opacity-48",
} as const;

/**
 * A single navigation entry. Owned by the engine rather than each app so that
 * "where am I" looks and announces the same in every StudioFlow surface.
 * When the rail is collapsed the label is hidden visually but kept for assistive
 * tech, and a tooltip restores it for sighted users.
 */
export function NavItem({ icon, active = false, disabled = false, children, className, ...props }: NavItemProps) {
  const { collapsed } = useContext(RailContext);

  /* Visually hidden, NOT display:none. display:none also strips the label from the
     accessibility tree, which leaves every collapsed nav item with no accessible
     name at all (WCAG 4.1.2 / 2.4.4). The label must survive for screen readers. */
  const labelClasses = cx(
    "group-data-collapsed:sr-only",
    /* CSS also forces labels during the first hydrated frame. Runtime state then
       preserves the desktop preference without allowing an icon-only mobile rail. */
    "max-[840px]:group-data-collapsed:not-sr-only",
  );
  const itemClasses = cx(
    NAV_ITEM_BASE_CLASSES,
    disabled ? NAV_ITEM_STATE_CLASSES.disabled : active ? NAV_ITEM_STATE_CLASSES.active : NAV_ITEM_STATE_CLASSES.idle,
    /* Collapsed rail degrades the item to its icon without the app re-rendering. */
    "group-data-collapsed:justify-center group-data-collapsed:gap-0 group-data-collapsed:px-0 group-data-collapsed:text-center",
    "max-[840px]:group-data-collapsed:justify-start max-[840px]:group-data-collapsed:gap-2.5 max-[840px]:group-data-collapsed:px-2.5 max-[840px]:group-data-collapsed:py-[7px] max-[840px]:group-data-collapsed:text-left",
    className,
  );

  const content = (
    <>
      {icon ? <span className="inline-flex shrink-0 [&_svg]:h-4 [&_svg]:w-4" aria-hidden="true">{icon}</span> : null}
      <span className={labelClasses}>{children}</span>
    </>
  );

  const item = disabled ? (
    <button type="button" className={itemClasses} disabled {...(props as ButtonHTMLAttributes<HTMLButtonElement>)}>
      {content}
    </button>
  ) : (
    <a className={itemClasses} data-active={active || undefined} aria-current={active ? "page" : undefined} {...props}>
      {content}
    </a>
  );

  return collapsed ? <Tooltip content={children} side="right">{item}</Tooltip> : item;
}

export function PageShell({
  size = "default",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { size?: "default" | "wide" }) {
  return (
    <div
      className={cx(
        "mx-auto grid w-full max-w-(--ui-page-max) gap-6 p-(--ui-page-padding) max-[560px]:gap-5",
        size === "default" && "max-w-(--ui-page-max)",
        className,
      )}
      data-size={size}
      {...props}
    />
  );
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
    <header
      className={cx(
        "flex items-start justify-between gap-5 max-[560px]:flex-col",
        divider && "border-b border-line pb-4",
        className,
      )}
      data-divider={divider || undefined}
      {...props}
    >
      <div className="grid min-w-0 gap-1">
        {eyebrow ? <Text meta>{eyebrow}</Text> : null}
        <Heading level={1}>{title}</Heading>
        {description ? <Text as="p" tone="secondary">{description}</Text> : null}
        {meta ? <div className="mt-1">{meta}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 max-[560px]:justify-start">{actions}</div> : null}
    </header>
  );
}
