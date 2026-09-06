import { AccountMenu } from "./account-menu";

import { DisplaySettingsProvider } from "./display-settings";

import Link from "next/link";

import type { ReactNode } from "react";


/* eslint-disable @next/next/no-img-element -- brand mark accepts a local path or owner-configured host. */

import { AppShell,Text } from "@/platform/ui_engine";

import type { SessionPrincipal } from "@platform/core/auth";

import { hasPermission } from "@platform/core/rbac";

import type { PlatformGeneralSettings } from "@platform/core/settings";


import { AuthenticatedPlatformNavigation,HeaderApplicationNavigation,type ShellAppLink } from "./navigation";


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
    <DisplaySettingsProvider value={{ locale: settings.locale, timezone: settings.timezone }}><AppShell
      brand={settings.brandMarkUrl ? (
        <Link href="/" aria-label={`Open ${settings.appTitle} home`} className="flex min-w-0 items-center rounded-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus">
          <img src={settings.brandMarkUrl} alt={settings.appTitle} className="h-[38px] max-w-[190px] shrink-0 object-contain object-left" />
        </Link>
      ) : (
        <Link href="/" aria-label={`Open ${settings.appTitle} home`} className="flex min-w-0 items-center gap-2.5 rounded-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus">
          <div className="min-w-0">
            <Text as="span" className="block truncate font-semibold">{settings.appTitle}</Text>
            {subtitle !== settings.appTitle ? (
              <Text as="span" tone="tertiary" size="sm" className="block truncate">{subtitle}</Text>
            ) : null}
          </div>
        </Link>
      )}
      collapsedBrand={<Text as="span" weight="semibold">{appAbbreviation ?? productMark}</Text>}
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
        <AccountMenu name={principal.displayName} logoutAction={logoutAction} />
      </div>}
    >
      {children}
    </AppShell></DisplaySettingsProvider>
  );
}
