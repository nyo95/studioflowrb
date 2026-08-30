"use client";

import { Boxes, Building2, FlaskConical, Settings, Tags } from "lucide-react";
import { usePathname } from "next/navigation";

import { NavItem } from "@/platform/ui_engine";

const items = [
  { href: "/masterdata/catalog", label: "Brand & Catalog", icon: Tags, matches: ["/masterdata/catalog", "/masterdata/brands", "/masterdata/categories", "/masterdata/skus"] },
  { href: "/masterdata/parties", label: "Vendor & Supplier", icon: Building2, matches: ["/masterdata/parties"] },
  { href: "/masterdata/pricing", label: "Pricing", icon: Boxes, matches: ["/masterdata/pricing"] },
] as const;

function isCurrent(pathname: string, matches: readonly string[]): boolean {
  return matches.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function MasterDataNavigation() {
  const pathname = usePathname();
  return (
    <>
      {items.map(({ href, label, icon: Icon, matches }) => (
        <NavItem key={href} href={href} icon={<Icon size={16} />} active={isCurrent(pathname, matches)}>{label}</NavItem>
      ))}
      <NavItem disabled icon={<FlaskConical size={16} />} title="Sample ownership is not yet approved">Samples</NavItem>
    </>
  );
}

export function MasterDataUtilityNavigation() {
  const pathname = usePathname();
  const matches = ["/masterdata/settings", "/masterdata/audit", "/masterdata/data"];
  return <NavItem href="/masterdata/settings" icon={<Settings size={16} />} active={isCurrent(pathname, matches)}>General Settings</NavItem>;
}
