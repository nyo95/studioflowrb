import { AccountMenu } from "./account-menu";

import { DisplaySettingsProvider } from "./display-settings";

import Link from "next/link";

import type { ReactNode } from "react";


/* eslint-disable @next/next/no-img-element -- brand mark accepts a local path or owner-configured host. */

import { Text } from "@/platform/ui_engine";

import type { SessionPrincipal } from "@platform/core/auth";

import type { PlatformGeneralSettings } from "@platform/core/settings";


import { AuthenticatedPlatformNavigation,HeaderApplicationNavigation,type ShellAppLink } from "./navigation";
import { RouteAwareAppShell } from "./route-aware-app-shell";
import { getSettingsMenuVisibility } from "./shell-rules";


/**
 * The top bar's mark, per the prototype's `.a-logo`. Initials for a multi-word
 * name; a name that is already an abbreviation is kept whole; a single
 * closed-up product name is split on its capitals, so "StudioFlow" reads "SF"
 * and not "S" — the previous rule took the first letter of each whitespace-
 * separated word, which yields exactly one letter for a one-word title.
 */
function brandMark(name: string): string {
  const words = name.trim().split(/[\s_/-]+/).filter(Boolean);
  if (words.length === 1 && words[0].length <= 3) return words[0].toUpperCase();
  const parts = words.flatMap((word) => word.match(/[A-Z]+(?![a-z])|[A-Z][a-z0-9]*|[a-z0-9]+/g) ?? [word]);
  const initials = parts.length > 1 ? parts.map((part) => part[0]).join("") : (parts[0] ?? "");
  return initials.slice(0, 3).toUpperCase();
}

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
  /* The app chip beside this already names the active application, so the mark
     takes the organisation whenever that is distinct — the prototype's pairing
     of `.a-logo` (studio) with `.a-app` (application). */
  const markSource = settings.organizationName && settings.organizationName !== settings.appTitle
    ? settings.organizationName
    : settings.appTitle;
  const productMark = brandMark(markSource) || "SF";
  const subtitle = appName ?? settings.organizationName;
  const { showSettings } = getSettingsMenuVisibility(grants);
  return (
    <DisplaySettingsProvider value={{ locale: settings.locale, timezone: settings.timezone }}><RouteAwareAppShell
      appRootPaths={apps.map((app) => app.rootPath)}
      brand={settings.brandMarkUrl ? (
        <Link href="/" aria-label={`Open ${settings.appTitle} home`} className="flex min-w-0 items-center rounded-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus">
          <img src={settings.brandMarkUrl} alt={settings.appTitle} className="h-7 max-w-[150px] shrink-0 object-contain object-left" />
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
      collapsedBrand={settings.brandMarkUrl ? (
        <Link href="/" aria-label={`Open ${settings.appTitle} home`} className="flex items-center rounded-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus">
          <img src={settings.brandMarkUrl} alt={settings.appTitle} className="h-6 w-auto max-w-24 object-contain" />
        </Link>
      ) : (
        /* The top bar's mark is a mono monogram on its own baseline — no chip,
           no box. Sized to sit on one 46px line beside the app chip. */
        <Link href="/" aria-label={`Open ${settings.appTitle} home`} className="flex items-center rounded-action px-0.5 font-ui-mono text-xs font-medium tracking-[0.16em] text-ink no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus">
          {appAbbreviation ?? productMark}
        </Link>
      )}
      collapsible
      navigationLabel={`${settings.appTitle} navigation`}
      navigation={<AuthenticatedPlatformNavigation domainNavigation={domainNavigation} />}
      utility={domainUtilityNavigation}
      /* Prototype `.a-top` order: mark, app chip, search, spacer, avatar. The
         search grows to its own 300px cap and the spacer takes the remainder,
         so the field keeps its width instead of being pushed about by the
         account menu's name length. */
      topbar={<div className="flex w-full items-center gap-2.5">
        <HeaderApplicationNavigation apps={apps} />
        {contextSlot}
        <span className="flex-1" aria-hidden="true" />
        <AccountMenu
          name={principal.displayName}
          logoutAction={logoutAction}
          showSettings={showSettings}
        />
      </div>}
    >
      {children}
    </RouteAwareAppShell></DisplaySettingsProvider>
  );
}
