"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Popover } from "radix-ui";
import { useCallback, useEffect, useState } from "react";

import { Button, Text } from "@/platform/ui_engine";
import { useDisplaySettings } from "./display-settings";
import { formatInstant } from "@platform/utilities/date";

import {
  getUnreadNotificationCountAction,
  listNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationsReadAction,
} from "@/app/(platform)/notifications/actions";

type Notification = {
  id: string;
  appId: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  createdAt: Date;
  readAt: Date | null;
};

const POLL_INTERVAL_MS = 60_000;

/**
 * Platform-wide in-app inbox (CORE.md §15, first consumer: sample requests).
 * Delivery is polling — about a minute, and again whenever the route
 * changes — per `PLAN.md` WO-SR-01; there is no real-time channel.
 */
export function NotificationBell() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Notification[] | null>(null);
  const { locale, timezone } = useDisplaySettings();

  const refreshCount = useCallback(() => {
    void getUnreadNotificationCountAction().then((result) => {
      if (result.ok) setUnread(result.data.unread);
    });
  }, []);

  useEffect(() => {
    refreshCount();
    // A background tab does not need fresh counts; catch up as soon as it is visible again.
    const tick = () => { if (document.visibilityState === "visible") refreshCount(); };
    const interval = setInterval(tick, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", tick); };
  }, [refreshCount]);

  useEffect(() => {
    refreshCount();
  }, [pathname, refreshCount]);

  useEffect(() => {
    if (!open) return;
    void listNotificationsAction(20).then((result) => {
      if (result.ok) setItems(result.data);
    });
  }, [open]);

  const markAllRead = () => {
    void markAllNotificationsReadAction().then((result) => {
      if (!result.ok) return;
      setUnread(0);
      setItems((current) => current?.map((item) => ({ ...item, readAt: item.readAt ?? new Date() })) ?? current);
    });
  };

  const openItem = (item: Notification) => {
    if (item.readAt) return;
    void markNotificationsReadAction([item.id]).then((result) => {
      if (!result.ok) return;
      setUnread((count) => Math.max(0, count - 1));
      setItems((current) => current?.map((row) => (row.id === item.id ? { ...row, readAt: new Date() } : row)) ?? current);
    });
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
          className="relative grid h-6 w-6 shrink-0 place-items-center rounded-full border-0 bg-transparent text-ink-tertiary transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus"
        >
          <Bell size={14} aria-hidden="true" />
          {unread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-danger px-[3px] text-[9px] font-bold leading-none text-ink-inverse">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-[65] w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-control border border-line bg-surface-raised shadow-elevated"
        >
          <div className="flex items-center justify-between border-b border-line-subtle px-3 py-2">
            <Text weight="semibold" size="sm">Notifications</Text>
            {items && items.some((item) => !item.readAt) ? (
              <Button variant="ghost" size="sm" onClick={markAllRead}>Mark all read</Button>
            ) : null}
          </div>
          <div className="max-h-[360px] overflow-auto p-[5px]">
            {items === null ? (
              <Text as="p" size="sm" tone="tertiary" className="px-2.5 py-[18px] text-center">Loading…</Text>
            ) : items.length === 0 ? (
              <Text as="p" size="sm" tone="tertiary" className="px-2.5 py-[18px] text-center">No notifications yet.</Text>
            ) : (
              items.map((item) => {
                const row = (
                  <div className={`grid gap-0.5 rounded-action px-2.5 py-[7px] ${item.readAt ? "" : "bg-surface-muted"}`}>
                    <span className="flex items-center gap-1.5">
                      {!item.readAt ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-action" aria-hidden="true" /> : null}
                      <span className="truncate font-medium text-ink">{item.title}</span>
                    </span>
                    {item.body ? <span className="text-xs text-ink-secondary">{item.body}</span> : null}
                    <span className="text-xs text-ink-tertiary">{formatInstant(item.createdAt, { locale, timeZone: timezone, style: "datetime" })}</span>
                  </div>
                );
                return item.href ? (
                  <Link key={item.id} href={item.href} prefetch={false} onClick={() => { openItem(item); setOpen(false); }} className="block text-inherit no-underline hover:bg-surface-muted rounded-action">
                    {row}
                  </Link>
                ) : (
                  <button key={item.id} type="button" onClick={() => openItem(item)} className="block w-full border-0 bg-transparent p-0 text-left hover:bg-surface-muted rounded-action">
                    {row}
                  </button>
                );
              })
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
