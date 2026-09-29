"use client";

import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { getUnreadMessengerCountAction } from "@/app/(platform)/messenger/actions";

const POLL_INTERVAL_MS = 60_000;

export function MessengerLink() {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(() => {
    void getUnreadMessengerCountAction().then((result) => {
      if (result.ok) setUnread(result.data.unread);
    });
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [pathname, refresh]);

  return (
    <Link
      href="/messenger"
      aria-label={unread > 0 ? `Messenger, ${unread} unread` : "Messenger"}
      className="relative grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-tertiary transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus"
    >
      <MessageCircle size={15} aria-hidden="true" />
      {unread > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-danger px-[3px] text-[9px] font-bold leading-none text-ink-inverse">
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
