"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type ShellAppLink = { appId: string; name: string; rootPath: string };

function activePath(pathname: string, href: string, includeChildren = true): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || (includeChildren && pathname.startsWith(`${href}/`));
}

/** App switching belongs to the continuous top header, not the app-local rail. */
export function HeaderApplicationNavigation({ apps }: { apps: readonly ShellAppLink[] }) {
  const pathname = usePathname();
  return (
    <nav className="ml-auto flex min-w-0 items-center gap-1 overflow-x-auto" aria-label="Applications">
      {apps.map((app) => {
        const active = activePath(pathname, app.rootPath);
        return (
          <Link
            key={app.appId}
            href={app.rootPath}
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-8 items-center rounded-action px-2.5 text-sm transition-colors ${
              active ? "bg-surface-muted font-semibold text-ink" : "text-ink-secondary hover:bg-surface-muted hover:text-ink"
            }`}
          >
            {app.name}
          </Link>
        );
      })}
    </nav>
  );
}

export function AuthenticatedPlatformNavigation({ domainNavigation }: {
  domainNavigation?: React.ReactNode;
}) {
  return (
    <div className="grid gap-1 max-[840px]:contents">
      {domainNavigation}
    </div>
  );
}
