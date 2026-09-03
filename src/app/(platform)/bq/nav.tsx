"use client";

import { FileText, Library } from "lucide-react";
import { usePathname } from "next/navigation";

import { NavItem } from "@/platform/ui_engine";

type BqNavLink = {
  href: string;
  label: string;
  icon: typeof FileText;
  exact?: boolean;
};

const links: readonly BqNavLink[] = [
  { href: "/bq", label: "Projects", icon: FileText, exact: true },
  { href: "/bq/library", label: "BQ Library", icon: Library },
];

export function BqNav() {
  const pathname = usePathname();

  if (!pathname.startsWith("/bq")) return null;

  return (
    <nav className="mt-2 grid gap-1 border-t border-line-subtle pt-2" aria-label="BQ navigation">
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
