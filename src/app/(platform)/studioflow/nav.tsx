"use client";

import { BookMarked, Building2, ChartGantt, FolderKanban, ListChecks, Settings } from "lucide-react";
import { usePathname } from "next/navigation";

import { NavGroup, NavItem, UtilitySection } from "@/platform/ui_engine";
import { STUDIOFLOW_NAV_LINKS } from "@/apps/studioflow/public/nav";

const ICONS: Record<string, typeof ListChecks> = {
  "/studioflow": ListChecks,
  "/studioflow/projects": FolderKanban,
  "/studioflow/timeline": ChartGantt,
  "/studioflow/clients": Building2,
  "/studioflow/library": BookMarked,
  "/studioflow/settings": Settings,
};

function isActive(pathname: string, href: string, exact = false): boolean {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/** StudioFlow entries in the shared rail; shown only inside the app. */
export function StudioFlowNav() {
  const pathname = usePathname();
  if (!pathname.startsWith("/studioflow")) return null;
  return (
    <NavGroup label="StudioFlow navigation">
      {STUDIOFLOW_NAV_LINKS.workspace.map(({ href, label, exact }) => {
        const Icon = ICONS[href] ?? ListChecks;
        return (
          <NavItem key={href} href={href} icon={<Icon size={16} />} active={isActive(pathname, href, exact)} prefetch={false}>
            {label}
          </NavItem>
        );
      })}
    </NavGroup>
  );
}

export function StudioFlowUtilityNav() {
  const pathname = usePathname();
  if (!pathname.startsWith("/studioflow")) return null;
  return (
    <UtilitySection>
      {STUDIOFLOW_NAV_LINKS.utility.map(({ href, label, exact }) => {
        const Icon = ICONS[href] ?? Settings;
        return (
          <NavItem key={href} href={href} icon={<Icon size={16} />} active={isActive(pathname, href, exact)} prefetch={false}>
            {label}
          </NavItem>
        );
      })}
    </UtilitySection>
  );
}
