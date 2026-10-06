"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { DropdownMenu } from "radix-ui";
import { ChevronRight, LogOut, Settings, UserRound } from "lucide-react";
import { initialsOf, NavAction, NavItem } from "@/platform/ui_engine";

import { isApplicationPath } from "./shell-rules";

export function AccountMenu({ name, logoutAction, showSettings }: {
  name: string;
  logoutAction: () => Promise<void>;
  showSettings: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const itemClass = "flex min-h-9 w-full items-center gap-2 rounded-action px-3 py-2 text-sm outline-none data-[highlighted]:bg-surface-muted focus-visible:bg-surface-muted";
  return <DropdownMenu.Root>
    {/* Prototype `.a-av`: a 24px filled circle, not a named button. The name
        is not lost — it labels the control for assistive tech and heads the
        menu below, where it has room to be read rather than truncated. */}
    <DropdownMenu.Trigger asChild>
      <button
        type="button"
        aria-label={`Account menu for ${name}`}
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full border-0 bg-action text-[9.5px] font-bold tracking-[0.02em] text-action-ink transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus"
      >
        {initialsOf(name)}
      </button>
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal><DropdownMenu.Content align="end" sideOffset={6} className="z-[65] min-w-48 rounded-control border border-line bg-surface-raised p-1 shadow-elevated">
      <DropdownMenu.Label className="truncate px-3 pb-1 pt-1.5 text-xs font-semibold text-ink">{name}</DropdownMenu.Label>
      <DropdownMenu.Item asChild><Link href="/account" className={itemClass}><UserRound size={16} aria-hidden="true" />My preferences</Link></DropdownMenu.Item>
      {showSettings ? <DropdownMenu.Item asChild><Link href="/settings/general" className={itemClass}><Settings size={16} aria-hidden="true" />Settings</Link></DropdownMenu.Item> : null}
      <DropdownMenu.Separator className="my-1 h-px bg-line" />
      <DropdownMenu.Item
        className={itemClass}
        disabled={pending}
        onSelect={(event) => {
          event.preventDefault();
          startTransition(async () => {
            await logoutAction();
          });
        }}
      >
        <LogOut size={16} aria-hidden="true" />{pending ? "Signing out…" : "Sign out"}
      </DropdownMenu.Item>
    </DropdownMenu.Content></DropdownMenu.Portal>
  </DropdownMenu.Root>;
}

/**
 * The account block at the top of the rail (DESIGN v2 §10.1, owner decision 1): avatar, name and the way
 * to the person's own preferences. Collapsed, only the avatar shows. A phone keeps `AccountMenu` in the
 * top bar instead, because the rail becomes a strip there.
 */
export function RailAccount({ name, detail }: { name: string; detail?: string | null }) {
  return (
    <Link
      href="/account"
      aria-label={`My preferences (${name})`}
      title={name}
      className="flex min-h-11 items-center gap-2.5 rounded-control px-1.5 py-1.5 text-left no-underline transition-colors hover:bg-[color-mix(in_srgb,var(--ui-text-primary)_7%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-line-focus group-data-collapsed:justify-center group-data-collapsed:px-0"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-action text-[11px] font-bold text-action-ink" aria-hidden="true">{initialsOf(name)}</span>
      <span className="grid min-w-0 leading-tight group-data-collapsed:sr-only">
        <span className="truncate text-sm font-semibold text-ink">{name}</span>
        {detail ? <span className="truncate text-xs text-ink-tertiary">{detail}</span> : null}
      </span>
      <ChevronRight size={14} aria-hidden="true" className="ml-auto shrink-0 text-ink-tertiary group-data-collapsed:hidden" />
    </Link>
  );
}

/** The General group at the foot of the rail: Settings (when allowed) and Log out. */
export function RailGeneral({ logoutAction, showSettings }: { logoutAction: () => Promise<void>; showSettings: boolean }) {
  const [pending, startTransition] = useTransition();
  const settingsActive = usePathname().startsWith("/settings");
  return (
    <>
      <p className="m-0 px-2 pt-1 pb-1 text-label text-ink-tertiary group-data-collapsed:hidden">General</p>
      {showSettings ? <NavItem href="/settings/general" icon={<Settings />} active={settingsActive} prefetch={false}>Settings</NavItem> : null}
      <NavAction icon={<LogOut />} disabled={pending} onClick={() => startTransition(async () => { await logoutAction(); })}>
        {pending ? "Signing out…" : "Log out"}
      </NavAction>
    </>
  );
}

/**
 * The account menu in the top bar. Inside an app the rail carries the account on a desktop, so the menu
 * shows only below 840px; a surface without a rail (Settings, Account) keeps it at every width.
 */
export function TopbarAccount({ appRootPaths, ...menu }: { appRootPaths: readonly string[] } & Parameters<typeof AccountMenu>[0]) {
  const inApp = isApplicationPath(usePathname(), appRootPaths);
  return <div className={inApp ? "flex min-[840px]:hidden" : "flex"}><AccountMenu {...menu} /></div>;
}
