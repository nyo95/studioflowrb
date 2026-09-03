"use client";

import { Banknote, LayoutGrid, Tags, Truck } from "lucide-react";
import { usePathname } from "next/navigation";

import { NavItem } from "@/platform/ui_engine";

type MasterDataNavLink = {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
  exact?: boolean;
};

const links: readonly MasterDataNavLink[] = [
  { href: "/masterdata", label: "Overview", icon: LayoutGrid, exact: true },
  { href: "/masterdata/brands", label: "Brands", icon: Tags },
  { href: "/masterdata/vendors", label: "Vendors", icon: Truck },
  { href: "/masterdata/pricing", label: "Pricing", icon: Banknote },
];

/**
 * App-owned navigation data rendered by the shared UI Engine rail.
 * It intentionally appears only while the operator is inside Master Data;
 * the platform shell continues to own the rail's structure and styling.
 */
export function MasterDataNav() {
  const pathname = usePathname();

  if (!pathname.startsWith("/masterdata")) return null;

  return (
    <nav className="mt-2 grid gap-1 border-t border-line-subtle pt-2" aria-label="Master Data navigation">
      {links.map(({ href, label, icon: Icon, exact }) => {
        const isActive = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <NavItem
            key={href}
            icon={<Icon size={17} />}
            active={isActive}
            href={href}
          >
            {label}
          </NavItem>
        );
      })}
    </nav>
  );
}
