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
    <div style={{ display: "grid", gap: 4 }}>
      <NavItem href="/" icon={<LayoutGrid size={17} />} active={pathname === "/"}>Applications</NavItem>
      {apps.map((app) => (
        <NavItem key={app.appId} href={app.rootPath} icon={<AppWindow size={17} />} active={activePath(pathname, app.rootPath)}>
          {app.name}
        </NavItem>
      ))}
      {domainNavigation ? <div style={{ display: "grid", gap: 4, marginTop: 8 }}>{domainNavigation}</div> : null}
      <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
        <NavItem href="/account" icon={<UserRound size={17} />} active={activePath(pathname, "/account")}>Account</NavItem>
        {showGeneralSettings ? <NavItem href="/settings/general" icon={<Settings size={17} />} active={activePath(pathname, "/settings/general")}>General Settings</NavItem> : null}
        {showUsers ? <NavItem href="/settings/access/users" icon={<Users size={17} />} active={activePath(pathname, "/settings/access/users")}>Users</NavItem> : null}
        {showRoles ? <NavItem href="/settings/access/roles" icon={<ShieldCheck size={17} />} active={activePath(pathname, "/settings/access/roles")}>Roles &amp; Access</NavItem> : null}
      </div>
    </div>
  );
}
