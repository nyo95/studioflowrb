"use client";

import { Database, FileText, LayoutGrid, Settings, ShieldCheck, Users } from "lucide-react";
import { usePathname } from "next/navigation";

import { NavItem, NavSubmenu } from "@/platform/ui_engine";

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
        <NavItem key={app.appId} href={app.rootPath} icon={app.appId === "masterdata" ? <Database size={17} /> : app.appId === "bq" ? <FileText size={17} /> : <LayoutGrid size={17} />} active={activePath(pathname, app.rootPath)}>
          {app.name}
        </NavItem>
      ))}
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
