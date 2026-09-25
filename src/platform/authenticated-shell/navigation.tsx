"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Popover } from "radix-ui";
import { useEffect, useRef, useState } from "react";

export type ShellAppLink = { appId: string; name: string; rootPath: string };

function activePath(pathname: string, href: string, includeChildren = true): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || (includeChildren && pathname.startsWith(`${href}/`));
}

/**
 * App switching belongs to the continuous top header, not the app-local rail.
 * An app-name chip (with ChevronDown when multiple apps exist) opens the
 * switcher on click or hover; a short close delay prevents flicker when
 * moving the pointer from chip to menu.
 *
 * Placement is locked to right next to the brand/logo (GLOBAL-MENU-DESIGN-
 * BRIEF.md "Option B", owner decision 2026-09-23) — this component renders
 * first in the topbar row (authenticated-shell/index.tsx), with no `ml-auto`
 * of its own; the account menu/context slot are pinned right instead.
 *
 * Built on Popover, not DropdownMenu: DropdownMenu implements the ARIA `menu`
 * pattern, which moves focus onto the first item the instant it opens. That
 * focus jump (and Radix's pointer/highlight tracking that comes with the
 * `menu` role) fought with the hover handlers below and produced a runaway
 * open/close loop with the mouse sitting still. Popover has no such role and
 * doesn't steal focus on a pointer-triggered open, so plain hover works.
 */
export function HeaderApplicationNavigation({ apps }: { apps: readonly ShellAppLink[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeApp = apps.find((app) => activePath(pathname, app.rootPath));

  const openNow = () => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    setOpen(true);
  };
  const closeSoon = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  if (apps.length === 0) return null;

  return (
    <nav className="flex min-w-0 items-center" aria-label="Applications">
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            onMouseEnter={openNow}
            onMouseLeave={closeSoon}
            aria-label="Switch application"
            className="inline-flex min-h-8 min-w-0 items-center gap-1.5 rounded-action px-2.5 text-sm font-medium transition-colors hover:bg-surface-muted"
          >
            {activeApp ? <span className="truncate font-semibold text-ink">{activeApp.name}</span> : null}
            {apps.length > 1 ? <ChevronDown size={11} aria-hidden="true" className="shrink-0 text-ink-tertiary" /> : null}
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={6}
            onMouseEnter={openNow}
            onMouseLeave={closeSoon}
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => event.preventDefault()}
            className="z-[65] min-w-48 rounded-control border border-line bg-surface-raised p-1 shadow-elevated"
          >
            <p className="px-3 py-1.5 text-label text-ink-tertiary">Applications</p>
            {apps.map((app) => {
              const active = activePath(pathname, app.rootPath);
              return (
                <Link
                  key={app.appId}
                  href={app.rootPath}
                  prefetch={false}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={`flex min-h-9 items-center gap-2 rounded-action px-3 py-2 text-sm no-underline outline-none hover:bg-surface-muted ${
                    active ? "bg-surface-muted font-semibold text-ink" : "text-ink"
                  }`}
                >
                  {app.name}
                </Link>
              );
            })}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </nav>
  );
}

export function AuthenticatedPlatformNavigation({ domainNavigation }: {
  domainNavigation?: React.ReactNode;
}) {
  return (
    <div className="grid gap-1 max-[840px]:contents">
      {domainNavigation}
    </div>
  );
}
