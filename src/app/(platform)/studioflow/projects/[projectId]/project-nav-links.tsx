"use client";

import { History, LayoutList, Presentation, ScrollText, type LucideIcon } from "lucide-react";
import { usePathname } from "next/navigation";

import { PillTabs } from "@/platform/ui_engine";

export type ProjectNavItem = { href: string; label: string; exact?: boolean; detail: string | null };

export function ProjectNavLinks({ items }: { items: ProjectNavItem[] }) {
  const pathname = usePathname();
  const icons: Record<string, LucideIcon> = { Phases: LayoutList, MOM: ScrollText, Schedule: LayoutList, Presentation, History };
  return <PillTabs label="Project sections" items={items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = icons[item.label] ?? LayoutList;
        return { key: item.href, label: item.label, href: item.href, active, icon: <Icon aria-hidden="true" />, count: item.detail ?? undefined };
      })} />;
}
