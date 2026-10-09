"use client";

import { BookMarked, Building2, ChartGantt, FolderKanban, Lightbulb, ListChecks, Settings } from "lucide-react";
import { usePathname } from "next/navigation";

import { NavGroup, NavItem, UtilitySection } from "@/platform/ui_engine";
import { STUDIOFLOW_NAV_LINKS } from "@/apps/studioflow/public/nav";

const ICONS: Record<string, typeof ListChecks> = {
  "/studioflow": ListChecks,
  "/studioflow/projects": FolderKanban,
  "/studioflow/timeline": ChartGantt,
  "/studioflow/clients": Building2,
  "/studioflow/library": BookMarked,
  "/studioflow/ideas": Lightbulb,
  "/studioflow/settings": Settings,
};

function isActive(pathname: string, href: string, exact = false): boolean {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/** StudioFlow entries in the shared rail; shown only inside the app. */
export function StudioFlowNav({ waitingOnYou = 0, enabledModuleIds }: { waitingOnYou?: number; enabledModuleIds: readonly string[] }) {
  const pathname = usePathname();
  if (!pathname.startsWith("/studioflow")) return null;
  const links = STUDIOFLOW_NAV_LINKS.workspace.filter((link) => link.href !== "/studioflow/ideas" || enabledModuleIds.includes("ideas"));
  return (
    <NavGroup label="StudioFlow navigation" heading="StudioFlow">
      {links.map(({ href, label, exact }) => {
        const Icon = ICONS[href] ?? ListChecks;
        return (
          <NavItem key={href} href={href} icon={<Icon size={16} />} active={isActive(pathname, href, exact)} badge={href === "/studioflow" && waitingOnYou > 0 ? waitingOnYou : undefined} prefetch={false}>
            {label}
          </NavItem>
        );
      })}
    </NavGroup>
  );
}

/** `canOpenSettings`: the Settings entry shows only to people who may open at least one StudioFlow settings page. */
export function StudioFlowUtilityNav({ canOpenSettings = false }: { canOpenSettings?: boolean }) {
  const pathname = usePathname();
  if (!pathname.startsWith("/studioflow")) return null;
  const links = STUDIOFLOW_NAV_LINKS.utility.filter((link) => link.href !== "/studioflow/settings" || canOpenSettings);
  if (links.length === 0) return null;
  return (
    <UtilitySection>
      {links.map(({ href, label, exact }) => {
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
