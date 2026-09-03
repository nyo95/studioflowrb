import type { ReactNode } from "react";
import Link from "next/link";
import { UserRound } from "lucide-react";

import { AppShell, Button, Text } from "@/platform/ui_engine";
import type { SessionPrincipal } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import type { PlatformGeneralSettings } from "@platform/core/settings";

import { AuthenticatedPlatformNavigation, HeaderApplicationNavigation, type ShellAppLink } from "./navigation";

export function AuthenticatedShell({ principal, grants, settings, apps, logoutAction, appName, appAbbreviation, domainNavigation, domainUtilityNavigation, contextSlot, children }: {
  principal: SessionPrincipal;
  grants: readonly string[];
  settings: PlatformGeneralSettings;
  apps: readonly ShellAppLink[];
  logoutAction: () => Promise<void>;
  appName?: string;
  appAbbreviation?: string;
  domainNavigation?: ReactNode;
  domainUtilityNavigation?: ReactNode;
  contextSlot?: ReactNode;
  children: ReactNode;
}) {
  const productMark = settings.appTitle.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "SF";
  const subtitle = appName ?? settings.organizationName;
  return (
    <AppShell
      brand={<div className="flex min-w-0 items-center gap-2.5">
        {settings.brandMarkUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- owner-configured URL/path has no fixed image host.
          <img src={settings.brandMarkUrl} alt="" className="h-7 w-7 object-contain" />
        ) : null}
        <div className="min-w-0">
          <Text as="span" className="block truncate font-semibold">{settings.appTitle}</Text>
          {subtitle !== settings.appTitle ? (
            <Text as="span" tone="tertiary" size="sm" className="block truncate">{subtitle}</Text>
          ) : null}
        </div>
      </div>}
      collapsedBrand={<Text as="span" weight="semibold">{appAbbreviation ?? productMark}</Text>}
      collapsible
      railPresentation="compact"
      navigationLabel={`${settings.appTitle} navigation`}
      navigation={<AuthenticatedPlatformNavigation
        showGeneralSettings={hasPermission(grants, "platform.settings.read")}
        showUsers={hasPermission(grants, "platform.user.read")}
        showRoles={hasPermission(grants, "platform.role.read")}
        domainNavigation={domainNavigation}
      />}
      utility={domainUtilityNavigation}
      topbar={<div className="flex w-full items-center gap-3 px-(--ui-page-padding)">
        <HeaderApplicationNavigation apps={apps} />
        {contextSlot}
        <div className="group relative ml-auto">
          <Link href="/account" className="flex min-w-0 items-center gap-2 rounded-action px-2 py-1 text-sm hover:bg-surface-muted" title={`Open account settings for ${principal.displayName}`} aria-label={`Open account settings for ${principal.displayName}`}>
            <UserRound size={17} aria-hidden="true" />
            <span className="max-w-[220px] truncate whitespace-nowrap">{principal.displayName}</span>
          </Link>
          <div className="pointer-events-none absolute right-0 top-full z-30 pt-2 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
            <div className="min-w-36 rounded-card border border-line bg-surface p-1 shadow-elevated">
              <form action={logoutAction}>
                <Button type="submit" variant="ghost" className="w-full justify-start">Sign out</Button>
              </form>
            </div>
          </div>
        </div>
      </div>}
    >
      {children}
    </AppShell>
  );
}
