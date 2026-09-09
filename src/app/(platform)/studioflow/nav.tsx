"use client";

import { CalendarDays, FolderOpen, Globe, Grid2X2, ListChecks, Settings, ShoppingBag } from "lucide-react";
import { usePathname } from "next/navigation";

import { NavGroup, NavItem, NavSeparator } from "@/platform/ui_engine";

function activePath(pathname: string, href: string, exact = false): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * StudioFlow navigation rail.
 *
 * Structure (mirrors the proposed design):
 *   Workspace  — primary workspace views
 *   ──────────
 *   Extensions — additional or gated modules
 */
export function StudioFlowNav() {
  const pathname = usePathname();

  if (!pathname.startsWith("/studioflow")) return null;

  return (
    <>
      <NavGroup label="Workspace" heading="Workspace">
        <NavItem
          href="/studioflow/projects"
          icon={<Grid2X2 size={16} />}
          active={activePath(pathname, "/studioflow/projects")}
          prefetch={false}
        >
          Projects
        </NavItem>
        <NavItem
          href="/studioflow"
          icon={<ListChecks size={16} />}
          active={activePath(pathname, "/studioflow", true)}
          prefetch={false}
        >
          Tasks
        </NavItem>
        <NavItem
          href="/studioflow/upcoming"
          icon={<CalendarDays size={16} />}
          active={activePath(pathname, "/studioflow/upcoming")}
          prefetch={false}
          disabled
        >
          Upcoming
        </NavItem>
      </NavGroup>

      <NavSeparator />

      <NavGroup label="Extensions" heading="Extensions">
        <NavItem
          href="/studioflow/library"
          icon={<FolderOpen size={16} />}
          active={activePath(pathname, "/studioflow/library")}
          prefetch={false}
        >
          Library
        </NavItem>
        <NavItem
          href="/studioflow/activity"
          icon={<Globe size={16} />}
          active={activePath(pathname, "/studioflow/activity")}
          prefetch={false}
          disabled
        >
          Activity
        </NavItem>
        <NavItem
          href="/studioflow/schedule"
          icon={<ShoppingBag size={16} />}
          active={false}
          prefetch={false}
          disabled
        >
          Product Schedule
        </NavItem>
      </NavGroup>
    </>
  );
}

/**
 * Utility navigation rendered in the rail's bottom slot (below the divider).
 * Contains workspace-wide settings that don't belong in the main nav hierarchy.
 */
export function StudioFlowUtilityNav() {
  const pathname = usePathname();

  if (!pathname.startsWith("/studioflow")) return null;

  return (
    <NavItem
      href="/studioflow/settings"
      icon={<Settings size={16} />}
      active={activePath(pathname, "/studioflow/settings")}
      prefetch={false}
    >
      General Settings
    </NavItem>
  );
}
