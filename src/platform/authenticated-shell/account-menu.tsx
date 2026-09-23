"use client";

import Link from "next/link";
import { useTransition } from "react";
import { DropdownMenu } from "radix-ui";
import { ChevronDown, LogOut, Settings, UserRound } from "lucide-react";
import { Avatar, Button } from "@/platform/ui_engine";

export function AccountMenu({ name, logoutAction, showSettings }: {
  name: string;
  logoutAction: () => Promise<void>;
  showSettings: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const itemClass = "flex min-h-9 w-full items-center gap-2 rounded-action px-3 py-2 text-sm outline-none data-[highlighted]:bg-surface-muted focus-visible:bg-surface-muted";
  return <DropdownMenu.Root>
    <DropdownMenu.Trigger asChild><Button variant="ghost" leadingIcon={<Avatar name={name} size="sm" />} trailingIcon={<ChevronDown aria-hidden="true" />} aria-label={`Account menu for ${name}`}><span className="max-w-[180px] truncate max-[560px]:max-w-20">{name}</span></Button></DropdownMenu.Trigger>
    <DropdownMenu.Portal><DropdownMenu.Content align="end" sideOffset={6} className="z-[65] min-w-48 rounded-control border border-line bg-surface-raised p-1 shadow-elevated">
      <DropdownMenu.Item asChild><Link href="/account" className={itemClass}><UserRound size={16} aria-hidden="true" />Account</Link></DropdownMenu.Item>
      {showSettings ? <DropdownMenu.Item asChild><Link href="/settings/general" className={itemClass}><Settings size={16} aria-hidden="true" />Settings</Link></DropdownMenu.Item> : null}
      <DropdownMenu.Separator className="my-1 h-px bg-line" />
      <DropdownMenu.Item
        className={itemClass}
        disabled={pending}
        onSelect={(event) => {
          event.preventDefault();
          startTransition(async () => {
            await logoutAction();
          });
        }}
      >
        <LogOut size={16} aria-hidden="true" />{pending ? "Signing out…" : "Sign out"}
      </DropdownMenu.Item>
    </DropdownMenu.Content></DropdownMenu.Portal>
  </DropdownMenu.Root>;
}
