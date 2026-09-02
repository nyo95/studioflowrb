"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavLink = {
  href: string;
  label: string;
  exact?: boolean;
};

export function BqNav() {
  const pathname = usePathname();

  const links: NavLink[] = [
    { href: "/bq", label: "Projects", exact: true },
    { href: "/bq/library", label: "BQ Library" },
  ];

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-line pb-px mb-6 scrollbar-none" aria-label="BQ Navigation">
      {links.map(({ href, label, exact }) => {
        const isActive = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={`flex items-center gap-2 whitespace-nowrap px-3.5 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              isActive
                ? "border-action text-ink font-semibold"
                : "border-transparent text-ink-secondary hover:text-ink hover:border-line-subtle"
            }`}
          >
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
