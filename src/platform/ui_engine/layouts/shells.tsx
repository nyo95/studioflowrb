"use client";

import { ChevronLeft,ChevronRight,Lock } from "lucide-react";
import Link from "next/link";
import { DropdownMenu } from "radix-ui";
import { createContext,useContext,useEffect,useState,type AnchorHTMLAttributes,type ButtonHTMLAttributes,type HTMLAttributes,type ReactNode } from "react";

import { cx } from "../internal/cx";
import { getEffectiveRailCollapsed } from "../internal/rail-state";
import { Heading,Text } from "../primitives";
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
  /** Keep the desktop rail icon-only while retaining the full brand header. */
  railPresentation?: "expanded" | "compact";
  /** Controlled collapsed state. Omit to let the shell manage it. */
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  /** Compact mark rendered in place of `brand` while collapsed. Falls back to `brand`. */
  collapsedBrand?: ReactNode;
  expandLabel?: string;
  collapseLabel?: string;
  /** Remove the application rail when the current surface has no navigation. */
  railVisible?: boolean;
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
  railPresentation = "expanded",
  collapsed,
  defaultCollapsed = true,
  onCollapsedChange,
  collapsedBrand,
  expandLabel = "Expand navigation",
  collapseLabel = "Collapse navigation",
  railVisible = true,
}: AppShellProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
  const narrowNavigation = useNarrowNavigation();
  const storedCollapsed = railPresentation === "compact" ? true : collapsed ?? internalCollapsed;
  // Narrow layouts always retain visible labels. The desktop preference remains
  // untouched and returns when the viewport widens again.
  const isCollapsed = railVisible && getEffectiveRailCollapsed(collapsible, narrowNavigation, storedCollapsed);

  const toggle = () => {
    const next = !isCollapsed;
    if (collapsed === undefined) setInternalCollapsed(next);
    onCollapsedChange?.(next);
  };

  const railBrand = railPresentation === "compact" ? brand : isCollapsed ? (collapsedBrand ?? brand) : brand;

  return (
    <RailContext.Provider value={{ collapsed: isCollapsed }}>
      <div className={cx("min-h-dvh overflow-x-clip", className)} data-collapsed={isCollapsed || undefined}>
        {/* The top bar is one fixed line: its width and content never depend on the rail state. */}
        {topbar ? (
          <header className="sticky top-0 z-20 flex h-16 items-center border-b border-line bg-surface/94 backdrop-blur-[12px]">
            <div className="flex h-full w-(--ui-header-brand-width) min-w-0 shrink-0 items-center px-4 max-[840px]:w-auto max-[840px]:px-3">
              <div className="min-w-0 overflow-hidden">{brand}</div>
            </div>
            <div className="flex min-w-0 flex-1 items-center">{topbar}</div>
          </header>
        ) : null}
        <div
          className={cx(
            "grid overflow-x-clip transition-[grid-template-columns] duration-[160ms] motion-reduce:transition-none",
            railVisible
              ? "grid-cols-[var(--ui-rail-width)_minmax(0,1fr)] max-[840px]:grid-cols-1 max-[840px]:block"
              : "grid-cols-1",
            isCollapsed && "[--ui-rail-width:var(--ui-rail-collapsed-width)]",
            topbar ? "min-h-[calc(100dvh-4rem)]" : "min-h-dvh",
          )}
        >
          {/* Warm chrome and a drawn rule separate navigation from the work area. */}
          {railVisible ? <aside
            className={cx(
              "group relative sticky top-16 flex h-[calc(100dvh-4rem)] max-w-screen min-w-0 flex-col overflow-hidden border-r border-line",
              "bg-[color-mix(in_srgb,var(--ui-surface-muted)_52%,var(--ui-surface))]",
              !topbar && "top-0 h-screen",
              "max-[840px]:static max-[840px]:h-auto max-[840px]:border-b max-[840px]:border-r-0",
            )}
            aria-label={navigationLabel}
            data-collapsed={isCollapsed || undefined}
          >

            {!topbar ? (
              <div
                className={cx(
                  "flex min-h-[72px] items-center justify-between gap-2 px-4 py-3.5 max-[840px]:min-h-[52px]",
                  isCollapsed && "flex-col justify-center gap-1.5 px-2 py-2.5",
                )}
              >
                <div className={cx("min-w-0 overflow-hidden", isCollapsed && "grid place-items-center")}>
                  {railBrand}
                </div>
              </div>
            ) : null}
            {collapsible && railPresentation !== "compact" && !narrowNavigation ? (
              <button
                type="button"
                className="absolute right-0 top-1/2 z-10 flex h-10 w-4 -translate-y-1/2 items-center justify-center rounded-r-md bg-transparent text-ink-tertiary hover:bg-line/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-line-focus"
                aria-label={isCollapsed ? expandLabel : collapseLabel}
                aria-expanded={!isCollapsed}
                onClick={toggle}
              >
                {isCollapsed ? <ChevronRight aria-hidden="true" size={12} /> : <ChevronLeft aria-hidden="true" size={12} />}
              </button>
            ) : null}
            <nav
              className={cx(
                "min-w-0 flex-1 overflow-auto px-3 pt-2 pb-3.5",
                isCollapsed && "px-1.5",
                "max-[840px]:flex max-[840px]:flex-none max-[840px]:gap-1 max-[840px]:overflow-x-auto max-[840px]:p-2.5 max-[840px]:[scrollbar-width:none] max-[840px]:[&::-webkit-scrollbar]:hidden",
              )}
            >
              {navigation}
            </nav>
            {utility ?? null}
          </aside> : null}
          <main className="flex h-[calc(100dvh-4rem)] min-h-0 min-w-0 flex-col overflow-auto max-[840px]:h-auto max-[840px]:overflow-visible">{children}</main>
        </div>
      </div>
    </RailContext.Provider>
  );
}

export function NavGroup({ label, heading, children }: { label: string; heading?: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="grid gap-1 max-[840px]:contents">
      {heading ? (
        <p className="mt-1.5 mb-0.5 px-2.5 text-label text-ink-tertiary group-data-collapsed:hidden max-[840px]:hidden">
          {heading}
        </p>
      ) : null}
      {children}
    </div>
  );
}

/**
 * A thin horizontal rule separating navigation sections.
 * Hidden when the rail is collapsed to icon-only or on narrow/mobile layouts.
 */
export function NavSeparator() {
  return (
    <div
      role="separator"
      className="mx-0.5 my-2 h-px bg-[--ui-border-subtle] group-data-collapsed:hidden max-[840px]:hidden"
    />
  );
}

export type NavItemProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children"> & {
  icon?: ReactNode;
  /** Opt out of route prefetching for dense, database-backed application rails. */
  prefetch?: boolean;
  /** Marks the current location. Sets aria-current="page". */
  active?: boolean;
  /** An unavailable destination stays visible and disabled with its reason in `title`. */
  disabled?: boolean;
  children?: ReactNode;
  /** Badge element rendered at the trailing edge — count text, status pill, etc. Hidden when the rail is collapsed. */
  badge?: ReactNode;
};

const NAV_ITEM_BASE_CLASSES =
  "relative flex w-full min-h-[38px] items-center gap-2.5 rounded-control border border-transparent bg-transparent px-2.5 py-2 text-sm text-left font-[inherit] text-ink-secondary no-underline max-[840px]:w-auto max-[840px]:shrink-0 max-[840px]:min-h-[34px]";

const NAV_ITEM_STATE_CLASSES = {
  idle: "hover:border-line-subtle hover:bg-surface-muted hover:text-ink",
  active:
    "border-line max-[840px]:border-transparent bg-surface max-[840px]:bg-transparent text-ink font-semibold " +
    /* Current location. Hover already owns the muted fill, so "active" cannot rely on
       fill alone or the two become indistinguishable. It is marked on three channels
       at once: an ink rule, ink-weight text, and heavier type. */
    "before:absolute before:-left-px before:top-1/2 before:h-[18px] before:w-[3px] before:-translate-y-1/2 before:rounded-r-[2px] before:bg-action before:content-[''] max-[840px]:before:hidden",
  disabled: "cursor-not-allowed opacity-48",
} as const;

/**
 * A single navigation entry. Owned by the engine rather than each app so that
 * "where am I" looks and announces the same in every StudioFlow surface.
 * When the rail is collapsed the label is hidden visually but kept for assistive
 * tech, and a tooltip restores it for sighted users.
 */
export function NavItem({ icon, active = false, disabled = false, badge, children, className, prefetch, ...props }: NavItemProps) {
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

  const trailing = disabled
    ? <Lock aria-hidden="true" size={12} className="ml-auto shrink-0 text-ink-tertiary group-data-collapsed:hidden max-[840px]:group-data-collapsed:flex" />
    : badge
    ? <span className="ml-auto shrink-0 group-data-collapsed:hidden max-[840px]:group-data-collapsed:flex" aria-hidden="true">{badge}</span>
    : null;

  const content = (
    <>
      {icon ? <span className="inline-flex shrink-0 [&_svg]:h-4 [&_svg]:w-4" aria-hidden="true">{icon}</span> : null}
      <span className={labelClasses}>{children}</span>
      {trailing}
    </>
  );

  const item = disabled ? (
    <button type="button" className={itemClasses} disabled {...(props as unknown as ButtonHTMLAttributes<HTMLButtonElement>)}>
      {content}
    </button>
  ) : (
    <Link href={props.href ?? "#"} prefetch={prefetch} className={itemClasses} data-active={active || undefined} aria-current={active ? "page" : undefined} {...props}>
      {content}
    </Link>
  );

  return collapsed ? <Tooltip content={children} side="right">{item}</Tooltip> : item;
}

export type NavSubmenuItem = {
  href: string;
  label: string;
  icon?: ReactNode;
  active?: boolean;
  disabled?: boolean;
};

/**
 * A compact-rail navigation group. On desktop it is one icon opened by an
 * intentional click or keyboard activation; narrow layouts retain the labeled
 * child entries. Apps supply only routes and labels.
 */
export function NavSubmenu({
  label,
  icon,
  items,
}: {
  label: string;
  icon: ReactNode;
  items: readonly NavSubmenuItem[];
}) {
  const { collapsed } = useContext(RailContext);
  const [open, setOpen] = useState(false);
  const active = items.some((item) => item.active);

  if (!collapsed) {
    return (
      <div className="mt-3 max-[840px]:mt-0 max-[840px]:contents" role="group" aria-label={label}>
        <p className="flex min-h-7 items-center gap-2 px-2.5 text-label text-ink-tertiary max-[840px]:hidden">
          <span className="inline-flex shrink-0 [&_svg]:h-4 [&_svg]:w-4" aria-hidden="true">{icon}</span>
          {label}
        </p>
        <div className="mt-1 grid gap-1 border-l border-line-subtle pl-2 max-[840px]:mt-0 max-[840px]:border-l-0 max-[840px]:pl-0 max-[840px]:contents">
          {items.map((item) => (
            <NavItem key={item.href} href={item.href} icon={item.icon} active={item.active} disabled={item.disabled}>
              {item.label}
            </NavItem>
          ))}
        </div>
      </div>
    );
  }

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={cx(
            NAV_ITEM_BASE_CLASSES,
            active ? NAV_ITEM_STATE_CLASSES.active : NAV_ITEM_STATE_CLASSES.idle,
            "justify-center gap-0 px-0 text-center",
          )}
          aria-label={label}
        >
          <span className="inline-flex shrink-0 [&_svg]:h-4 [&_svg]:w-4" aria-hidden="true">{icon}</span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-[65] min-w-52 rounded-control bg-surface-raised p-[5px] shadow-elevated"
          side="right"
          align="start"
          sideOffset={0}
        >
          <DropdownMenu.Label className="px-2 py-1.5 text-label text-ink-tertiary">
            {label}
          </DropdownMenu.Label>
          {items.map((item) => (
            <DropdownMenu.Item key={item.href} asChild disabled={item.disabled}>
              <a
                href={item.href}
                className={cx(
                  "flex min-h-9 items-center gap-2 rounded-action px-2 py-1.5 text-sm text-ink outline-0 data-[disabled]:pointer-events-none data-[disabled]:opacity-45 data-[highlighted]:bg-surface-muted",
                  item.active && "bg-surface-muted font-semibold",
                )}
              >
                {item.icon ? <span className="inline-flex shrink-0 [&_svg]:h-4 [&_svg]:w-4" aria-hidden="true">{item.icon}</span> : null}
                {item.label}
              </a>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function PageShell({
  size,
  measure = "default",
  fill = false,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  /** @deprecated Use `measure` instead. */
  size?: "default" | "wide";
  /** Page measure: narrow (720px forms/settings) · default (1100px main content) · wide (1440px schedule/timeline) */
  measure?: "narrow" | "default" | "wide";
  fill?: boolean;
}) {
  // measure takes precedence; size is a legacy alias for backward compat
  const resolvedMeasure =
    measure !== "default" ? measure :
    size === "wide" ? "wide" : "default";
  const maxW =
    resolvedMeasure === "narrow" ? "max-w-(--ui-page-narrow)" :
    resolvedMeasure === "wide"   ? "max-w-(--ui-page-max)" :
                                   "max-w-(--ui-page-content)";
  return (
    <div
      className={cx(
        "mx-auto w-full gap-6 p-(--ui-page-padding) max-[560px]:gap-5 [&>*]:min-w-0",
        fill ? "flex min-h-0 flex-1 flex-col" : "grid",
        maxW,
        className,
      )}
      data-measure={resolvedMeasure}
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

/**
 * Styled wrapper for the AppShell's bottom-of-rail utility slot.
 * Render this as the outermost element of any utility navigation component.
 * Using this wrapper (rather than passing a bare ReactNode to the `utility` prop)
 * ensures the border and padding only appear when the component actually has content.
 */
export function UtilitySection({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-line px-3 pt-2.5 pb-3.5 max-[840px]:hidden group-data-collapsed:px-1.5">
      {children}
    </div>
  );
}

export type BreadcrumbEntry = {
  label: ReactNode;
  href?: string;
};

/**
 * The page's own context line: where this record sits, plus an optional
 * right-aligned affordance. It replaces a global topbar, so it is the only
 * place the parent collection is named on a detail page. The last entry is
 * the current page and is never a link.
 */
export function Breadcrumb({
  entries,
  action,
  label = "Breadcrumb",
  className,
  ...props
}: Omit<HTMLAttributes<HTMLElement>, "children"> & {
  entries: BreadcrumbEntry[];
  action?: ReactNode;
  label?: string;
}) {
  if (entries.length === 0) return null;
  return (
    <nav aria-label={label} className={cx("flex items-center gap-2 text-xs text-ink-tertiary", className)} {...props}>
      <ol className="m-0 flex min-w-0 list-none flex-wrap items-center gap-2 p-0">
        {entries.map((entry, index) => {
          const last = index === entries.length - 1;
          return (
            <li key={index} className="flex min-w-0 items-center gap-2">
              {index > 0 ? <span aria-hidden="true">/</span> : null}
              {entry.href && !last ? (
                <Link href={entry.href} className="truncate no-underline hover:text-ink">
                  {entry.label}
                </Link>
              ) : (
                <span className={cx("truncate", last && "font-medium text-ink")} aria-current={last ? "page" : undefined}>
                  {entry.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {action ? <div className="ml-auto shrink-0">{action}</div> : null}
    </nav>
  );
}
