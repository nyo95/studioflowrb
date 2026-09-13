"use client";

import { Banknote, LayoutGrid, Tags, Truck } from "lucide-react";
import { usePathname } from "next/navigation";

import { NavGroup, NavItem } from "@/platform/ui_engine";
import { MASTERDATA_NAV_LINKS } from "@/apps/masterdata/public/nav";

const iconMap: Record<string, typeof LayoutGrid> = {
  "/masterdata": LayoutGrid,
  "/masterdata/brands": Tags,
  "/masterdata/vendors": Truck,
  "/masterdata/pricing": Banknote,
};

/**
 * App-owned navigation data rendered by the shared UI Engine rail.
 * It intentionally appears only while the operator is inside Master Data;
 * the platform shell continues to own the rail's structure and styling.
 */
export function MasterDataNav() {
  const pathname = usePathname();

  if (!pathname.startsWith("/masterdata")) return null;

  return (
    <NavGroup label="Master Data navigation">
      {MASTERDATA_NAV_LINKS.map(({ href, label, exact }) => {
        const Icon = iconMap[href] ?? LayoutGrid;
        const isActive = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <NavItem
            key={href}
            icon={<Icon size={17} />}
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
