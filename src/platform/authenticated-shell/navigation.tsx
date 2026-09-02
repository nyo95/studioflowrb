"use client";

import { AppWindow, LayoutGrid, Settings, ShieldCheck, UserRound, Users } from "lucide-react";
import { usePathname } from "next/navigation";

import { NavItem } from "@/platform/ui_engine";

export type ShellAppLink = { appId: string; name: string; rootPath: string };

function activePath(pathname: string, href: string, includeChildren = true): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || (includeChildren && pathname.startsWith(`${href}/`));
}

export function AuthenticatedPlatformNavigation({ apps, showGeneralSettings, showUsers, showRoles, domainNavigation }: {
  apps: readonly ShellAppLink[];
  showGeneralSettings: boolean;
  showUsers: boolean;
  showRoles: boolean;
  domainNavigation?: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div className="grid gap-1">
      {apps.length > 1 ? <NavItem href="/" icon={<LayoutGrid size={17} />} active={pathname === "/"}>Applications</NavItem> : null}
      {apps.map((app) => (
        <NavItem key={app.appId} href={app.rootPath} icon={<AppWindow size={17} />} active={activePath(pathname, app.rootPath)}>
          {app.name}
        </NavItem>
      ))}
      {domainNavigation ? <div className="mt-2 grid gap-1">{domainNavigation}</div> : null}
      <div className="mt-4" role="group" aria-labelledby="settings-navigation-heading">
        <p
          id="settings-navigation-heading"
          className="flex min-h-7 items-center gap-2 px-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-tertiary group-data-collapsed:justify-center group-data-collapsed:px-0"
        >
          <Settings className="size-4 shrink-0" aria-hidden="true" />
          <span className="group-data-collapsed:sr-only">Settings</span>
        </p>
        <div className="mt-1 grid gap-1 border-l border-line-subtle pl-2 group-data-collapsed:border-l-0 group-data-collapsed:pl-0">
          <NavItem href="/account" icon={<UserRound size={17} />} active={activePath(pathname, "/account")}>Account</NavItem>
          {showGeneralSettings ? <NavItem href="/settings/general" icon={<Settings size={17} />} active={activePath(pathname, "/settings/general")}>General Settings</NavItem> : null}
          {showUsers ? <NavItem href="/settings/access/users" icon={<Users size={17} />} active={activePath(pathname, "/settings/access/users")}>Users</NavItem> : null}
          {showRoles ? <NavItem href="/settings/access/roles" icon={<ShieldCheck size={17} />} active={activePath(pathname, "/settings/access/roles")}>Roles &amp; Access</NavItem> : null}
        </div>
      </div>
    </div>
  );
}
