"use client";

import { FileText, Library } from "lucide-react";
import { usePathname } from "next/navigation";

import { NavGroup, NavItem } from "@/platform/ui_engine";
import { BQ_NAV_LINKS } from "@/apps/bq/public/nav";

const iconMap: Record<string, typeof FileText> = {
  "/bq": FileText,
  "/bq/library": Library,
};

export function BqNav() {
  const pathname = usePathname();

  if (!pathname.startsWith("/bq")) return null;

  return (
    <NavGroup label="BQ navigation">
      {BQ_NAV_LINKS.map(({ href, label, exact }) => {
        const Icon = iconMap[href] ?? FileText;
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
