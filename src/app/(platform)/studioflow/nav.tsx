"use client";

import { ClipboardCheck, FolderOpen, Library, Settings, Users } from "lucide-react";
import { usePathname } from "next/navigation";

import { NavGroup, NavItem } from "@/platform/ui_engine";

type StudioFlowNavLink = {
  href: string;
  label: string;
  icon: typeof FolderOpen;
  exact?: boolean;
  disabled?: boolean;
};

const links: readonly StudioFlowNavLink[] = [
  { href: "/studioflow", label: "Menunggu saya", icon: ClipboardCheck, exact: true },
  { href: "/studioflow/projects", label: "Semua project", icon: FolderOpen },
  { href: "/studioflow/clients", label: "Klien", icon: Users },
  {
    href: "/studioflow/library",
    label: "Library",
    icon: Library,
    disabled: true,
  },
  { href: "/studioflow/settings", label: "Pengaturan", icon: Settings },
];

/**
 * App-owned navigation rendered by the shared UI Engine rail.
 * Visible only while the user is inside StudioFlow.
 */
export function StudioFlowNav() {
  const pathname = usePathname();

  if (!pathname.startsWith("/studioflow")) return null;

  return (
    <NavGroup label="Navigasi StudioFlow">
      {links.map(({ href, label, icon: Icon, exact, disabled }) => {
        const isActive =
          !disabled &&
          (exact
            ? pathname === href
            : pathname === href || pathname.startsWith(`${href}/`));
        return (
          <NavItem
            key={href}
            icon={<Icon size={17} />}
            active={isActive}
            href={href}
            prefetch={false}
            disabled={disabled}
          >
            {label}
          </NavItem>
        );
      })}
    </NavGroup>
  );
}
