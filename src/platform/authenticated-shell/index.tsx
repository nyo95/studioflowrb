import type { ReactNode } from "react";
import { UserRound } from "lucide-react";

import { AppShell, Text, buttonClasses } from "@/platform/ui_engine";
import type { SessionPrincipal } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import type { PlatformGeneralSettings } from "@platform/core/settings";

import { AuthenticatedPlatformNavigation, type ShellAppLink } from "./navigation";

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
  return (
    <AppShell
      brand={<div className="flex min-w-0 items-center gap-2.5">
        {settings.brandMarkUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- owner-configured URL/path has no fixed image host.
          <img src={settings.brandMarkUrl} alt="" className="h-7 w-7 object-contain" />
        ) : null}
        <div className="min-w-0">
          <Text as="span" className="block truncate font-semibold">{settings.appTitle}</Text>
          <Text as="span" tone="tertiary" size="sm" className="block truncate">
            {appName ?? settings.organizationName}
          </Text>
        </div>
      </div>}
      collapsedBrand={<Text as="span" weight="semibold">{appAbbreviation ?? productMark}</Text>}
      collapsible
      navigationLabel={`${settings.appTitle} navigation`}
      navigation={<AuthenticatedPlatformNavigation
        apps={apps}
        showGeneralSettings={hasPermission(grants, "platform.settings.read")}
        showUsers={hasPermission(grants, "platform.user.read")}
        showRoles={hasPermission(grants, "platform.role.read")}
        domainNavigation={domainNavigation}
      />}
      utility={<>
        {domainUtilityNavigation}
        <form action={logoutAction}>
          <button type="submit" className={buttonClasses("ghost") + " w-full justify-start"}>Sign out</button>
        </form>
      </>}
      topbar={<div className="flex w-full items-center gap-3 px-(--ui-page-padding)">
        {contextSlot}
        <div className="ml-auto flex min-w-0 items-center gap-2" title={`Signed in as ${principal.displayName}`}>
          <UserRound size={17} aria-hidden="true" />
          <span className="max-w-[220px] truncate whitespace-nowrap">{principal.displayName}</span>
        </div>
      </div>}
    >
      {children}
    </AppShell>
  );
}
