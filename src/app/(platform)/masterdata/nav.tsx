"use client";

import { Banknote, FileSpreadsheet, FlaskConical, LayoutGrid, Tags, Truck } from "lucide-react";
import { usePathname } from "next/navigation";

import { NavGroup, NavItem } from "@/platform/ui_engine";
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
 */
export function MasterDataNav({ canManageSampleRequests = false, canUseWorkbook = false }: { canManageSampleRequests?: boolean; canUseWorkbook?: boolean }) {
  const pathname = usePathname();

  if (!pathname.startsWith("/masterdata")) return null;

  const links = MASTERDATA_NAV_LINKS.filter((link) => (link.href !== "/masterdata/sample-requests" || canManageSampleRequests) && (link.href !== "/masterdata/workbook" || canUseWorkbook));

  return (
    <NavGroup label="Master Data navigation">
      {links.map(({ href, label, exact }) => {
        const Icon = iconMap[href] ?? LayoutGrid;
        const isActive = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <NavItem
            key={href}
            icon={<Icon size={16} />}
            active={isActive}
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
