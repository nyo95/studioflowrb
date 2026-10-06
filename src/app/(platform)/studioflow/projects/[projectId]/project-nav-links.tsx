"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { CountBadge, filterChipClasses } from "@/platform/ui_engine";

export type ProjectNavItem = { href: string; label: string; exact?: boolean; detail: string | null };

export function ProjectNavLinks({ items }: { items: ProjectNavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex max-w-full gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Project sections">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link key={item.href} href={item.href} prefetch={false} className={`${filterChipClasses(active)} shrink-0 gap-1.5`} aria-current={active ? "page" : undefined}>
            {item.label}
            {item.detail ? <CountBadge>{item.detail}</CountBadge> : null}
          </Link>
        );
      })}
    </nav>
  );
}
