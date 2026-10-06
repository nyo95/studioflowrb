"use client";

import { Banknote, FileSpreadsheet, FlaskConical, LayoutGrid, Settings, Tags, Truck } from "lucide-react";
import { usePathname } from "next/navigation";

import { NavGroup, NavItem, UtilitySection } from "@/platform/ui_engine";
import { MASTERDATA_NAV_LINKS } from "@/apps/masterdata/public/nav";

const iconMap: Record<string, typeof LayoutGrid> = {
  "/masterdata": LayoutGrid,
  "/masterdata/brands": Tags,
  "/masterdata/vendors": Truck,
  "/masterdata/pricing": Banknote,
  "/masterdata/sample-requests": FlaskConical,
  "/masterdata/workbook": FileSpreadsheet,
};

/**
 * App-owned navigation data rendered by the shared UI Engine rail.
 * It intentionally appears only while the operator is inside Master Data;
 * the platform shell continues to own the rail's structure and styling.
 *
 * `canManageSampleRequests` hides the Sample requests link for staff without
 * that narrower permission, the same way the Deletions screen stays off this
 * list entirely rather than showing a link nobody but an approver can act on.
 *
 * `canUseWorkbook` does the same for Import & export: it shows for anyone who may export (read SKUs and prices) or import (manage them).
 *
 */
export function MasterDataNav({ canManageSampleRequests = false, canUseWorkbook = false, openSampleRequests = 0 }: { canManageSampleRequests?: boolean; canUseWorkbook?: boolean; openSampleRequests?: number }) {
  const pathname = usePathname();

  if (!pathname.startsWith("/masterdata")) return null;

  const links = MASTERDATA_NAV_LINKS.filter((link) => (link.href !== "/masterdata/sample-requests" || canManageSampleRequests) && (link.href !== "/masterdata/workbook" || canUseWorkbook));

  return (
    <NavGroup label="Master Data navigation" heading="Master Data">
      {links.map(({ href, label, exact }) => {
        const Icon = iconMap[href] ?? LayoutGrid;
        const isActive = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <NavItem
            key={href}
            icon={<Icon size={16} />}
            active={isActive}
            badge={href === "/masterdata/sample-requests" && openSampleRequests > 0 ? openSampleRequests : undefined}
            href={href}
            prefetch={false}
          >
            {label}
          </NavItem>
        );
      })}
    </NavGroup>
  );
}

/**
 * Master Data's Settings entry, in the rail's utility area at the foot like every app's. Shown only to people
 * who may open at least one Master Data settings page (`masterdata/settings/sections.ts`).
 */
export function MasterDataUtilityNav({ canOpenSettings = false }: { canOpenSettings?: boolean }) {
  const pathname = usePathname();
  if (!pathname.startsWith("/masterdata") || !canOpenSettings) return null;
  return (
    <UtilitySection>
      <NavItem icon={<Settings size={16} />} active={pathname.startsWith("/masterdata/settings")} href="/masterdata/settings" prefetch={false}>Settings</NavItem>
    </UtilitySection>
  );
}
