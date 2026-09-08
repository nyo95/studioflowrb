"use client";

import { FolderOpen, Settings, Users } from "lucide-react";
import { usePathname } from "next/navigation";

import { NavGroup, NavItem } from "@/platform/ui_engine";

type StudioFlowNavLink = {
  href: string;
  label: string;
  icon: typeof FolderOpen;
  exact?: boolean;
};

const links: readonly StudioFlowNavLink[] = [
  { href: "/studioflow", label: "Projects", icon: FolderOpen, exact: true },
  { href: "/studioflow/clients", label: "Clients", icon: Users },
  { href: "/studioflow/settings", label: "Settings", icon: Settings },
];

/**
 * App-owned navigation rendered by the shared UI Engine rail.
 * Visible only while the user is inside StudioFlow.
 */
export function StudioFlowNav() {
  const pathname = usePathname();

  if (!pathname.startsWith("/studioflow")) return null;

  return (
    <NavGroup label="StudioFlow navigation">
      {links.map(({ href, label, icon: Icon, exact }) => {
        const isActive =
          exact
            ? pathname === href
            : pathname === href || pathname.startsWith(`${href}/`);
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
