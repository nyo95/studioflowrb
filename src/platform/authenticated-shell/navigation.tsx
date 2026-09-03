"use client";

import Link from "next/link";
import { LayoutGrid, Settings, ShieldCheck, Users } from "lucide-react";
import { usePathname } from "next/navigation";

import { NavSubmenu } from "@/platform/ui_engine";

export type ShellAppLink = { appId: string; name: string; rootPath: string };

function activePath(pathname: string, href: string, includeChildren = true): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || (includeChildren && pathname.startsWith(`${href}/`));
}

/** App switching belongs to the continuous top header, not the app-local rail. */
export function HeaderApplicationNavigation({ apps }: { apps: readonly ShellAppLink[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex min-w-0 items-center gap-1 overflow-x-auto" aria-label="Applications">
      {apps.length > 1 ? (
        <Link
          href="/"
          className="inline-flex min-h-8 items-center gap-1.5 rounded-action px-2.5 text-sm text-ink-secondary hover:bg-surface-muted hover:text-ink"
          aria-current={pathname === "/" ? "page" : undefined}
        >
          <LayoutGrid size={16} aria-hidden="true" />
          <span>Applications</span>
        </Link>
      ) : null}
      {apps.map((app) => {
        const active = activePath(pathname, app.rootPath);
        return (
          <Link
            key={app.appId}
            href={app.rootPath}
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-8 items-center rounded-action px-2.5 text-sm transition-colors ${
              active ? "bg-surface-muted font-semibold text-ink" : "text-ink-secondary hover:bg-surface-muted hover:text-ink"
            }`}
          >
            {app.name}
          </Link>
        );
      })}
    </nav>
  );
}

export function AuthenticatedPlatformNavigation({ showGeneralSettings, showUsers, showRoles, domainNavigation }: {
  showGeneralSettings: boolean;
  showUsers: boolean;
  showRoles: boolean;
  domainNavigation?: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div className="grid gap-1">
      {domainNavigation}
      <NavSubmenu
        label="Administration"
        icon={<Settings size={17} />}
        items={[
          ...(showGeneralSettings ? [{ href: "/settings/general", label: "General Settings", icon: <Settings size={17} />, active: activePath(pathname, "/settings/general") }] : []),
          ...(showUsers ? [{ href: "/settings/access/users", label: "Users", icon: <Users size={17} />, active: activePath(pathname, "/settings/access/users") }] : []),
          ...(showRoles ? [{ href: "/settings/access/roles", label: "Roles & Access", icon: <ShieldCheck size={17} />, active: activePath(pathname, "/settings/access/roles") }] : []),
        ]}
      />
    </div>
  );
}
