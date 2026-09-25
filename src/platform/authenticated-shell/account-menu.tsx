"use client";

import Link from "next/link";
import { useTransition } from "react";
import { DropdownMenu } from "radix-ui";
import { LogOut, Settings, UserRound } from "lucide-react";
import { initialsOf } from "@/platform/ui_engine";

export function AccountMenu({ name, logoutAction, showSettings }: {
  name: string;
  logoutAction: () => Promise<void>;
  showSettings: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const itemClass = "flex min-h-9 w-full items-center gap-2 rounded-action px-3 py-2 text-sm outline-none data-[highlighted]:bg-surface-muted focus-visible:bg-surface-muted";
  return <DropdownMenu.Root>
    {/* Prototype `.a-av`: a 24px filled circle, not a named button. The name
        is not lost — it labels the control for assistive tech and heads the
        menu below, where it has room to be read rather than truncated. */}
    <DropdownMenu.Trigger asChild>
      <button
        type="button"
        aria-label={`Account menu for ${name}`}
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full border-0 bg-action text-[9.5px] font-bold tracking-[0.02em] text-action-ink transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus"
      >
        {initialsOf(name)}
      </button>
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal><DropdownMenu.Content align="end" sideOffset={6} className="z-[65] min-w-48 rounded-control border border-line bg-surface-raised p-1 shadow-elevated">
      <DropdownMenu.Label className="truncate px-3 pb-1 pt-1.5 text-xs font-semibold text-ink">{name}</DropdownMenu.Label>
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
