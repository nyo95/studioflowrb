"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ContextNavLink } from "@/platform/ui_engine";

type Item = { href: string; label: string; exact?: boolean; marker: string | null; detail: string | null; title?: string };

export function ProjectNavLinks({ items }: { items: Item[] }) {
  const pathname = usePathname();
  return (
    <>
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <ContextNavLink
            key={item.href}
            component={Link}
            surface="rail"
            href={item.href}
            active={active}
            title={item.title}
            marker={item.marker ? <span className={`h-[7px] w-[7px] rounded-pill ${item.marker}`} /> : undefined}
            detail={item.detail}
          >
            {item.label}
          </ContextNavLink>
        );
      })}
    </>
  );
}
