"use client";

import { CalendarDays, FolderOpen, Globe, Grid2X2, Layers, ListChecks, Settings, ShoppingBag } from "lucide-react";
import { usePathname } from "next/navigation";

import { NavGroup, NavItem, NavSeparator, UtilitySection } from "@/platform/ui_engine";
import { STUDIOFLOW_NAV_LINKS } from "@/apps/studioflow/public/nav";

function activePath(pathname: string, href: string, exact = false): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

const workspaceIconMap: Record<string, typeof Grid2X2> = {
  "/studioflow/projects": Grid2X2,
  "/studioflow": ListChecks,
  "/studioflow/upcoming": CalendarDays,
};

const extensionsIconMap: Record<string, typeof FolderOpen> = {
  "/studioflow/library": FolderOpen,
  "/studioflow/catalogue": Layers,
  "/studioflow/activity": Globe,
  "/studioflow/schedule": ShoppingBag,
};

const utilityIconMap: Record<string, typeof Settings> = {
  "/studioflow/settings": Settings,
};

/**
 * StudioFlow navigation rail.
 */
export function StudioFlowNav() {
  const pathname = usePathname();

  if (!pathname.startsWith("/studioflow")) return null;

  return (
    <>
      <NavGroup label="Workspace" heading="Workspace">
        {STUDIOFLOW_NAV_LINKS.workspace.map(({ href, label, exact, disabled }) => {
          const Icon = workspaceIconMap[href] ?? Grid2X2;
          return (
            <NavItem
              key={href}
              href={href}
              icon={<Icon size={16} />}
              active={activePath(pathname, href, exact)}
              prefetch={false}
              disabled={disabled}
            >
              {label}
            </NavItem>
          );
        })}
      </NavGroup>

      <NavSeparator />

      <NavGroup label="Extensions" heading="Extensions">
        {STUDIOFLOW_NAV_LINKS.extensions.map(({ href, label, exact, disabled }) => {
          const Icon = extensionsIconMap[href] ?? FolderOpen;
          return (
            <NavItem
              key={href}
              href={href}
              icon={<Icon size={16} />}
              active={activePath(pathname, href, exact)}
              prefetch={false}
              disabled={disabled}
            >
              {label}
            </NavItem>
          );
        })}
      </NavGroup>
    </>
  );
}

/**
 * Utility navigation rendered in the rail's bottom slot (below the divider).
 */
export function StudioFlowUtilityNav() {
  const pathname = usePathname();

  if (!pathname.startsWith("/studioflow")) return null;

  return (
    <UtilitySection>
      {STUDIOFLOW_NAV_LINKS.utility.map(({ href, label, exact }) => {
        const Icon = utilityIconMap[href] ?? Settings;
        return (
          <NavItem
            key={href}
            href={href}
            icon={<Icon size={16} />}
            active={activePath(pathname, href, exact)}
            prefetch={false}
          >
            {label}
          </NavItem>
        );
      })}
    </UtilitySection>
  );
}
