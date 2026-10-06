import { RailAccount, RailGeneral, TopbarAccount } from "./account-menu";

import { DisplaySettingsProvider } from "./display-settings";

import { NotificationBell } from "./notification-bell";
import { QuickMessenger } from "./quick-messenger";

import Link from "next/link";

import type { ReactNode } from "react";


/* eslint-disable @next/next/no-img-element -- brand mark accepts a local path or owner-configured host. */

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

export function AuthenticatedShell({ principal, grants, settings, apps, logoutAction, appAbbreviation, domainNavigation, domainUtilityNavigation, contextSlot, children }: {
  principal: SessionPrincipal;
  grants: readonly string[];
  settings: PlatformGeneralSettings;
  apps: readonly ShellAppLink[];
  logoutAction: () => Promise<void>;
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
  const { showSettings } = getSettingsMenuVisibility(grants);
  return (
    <DisplaySettingsProvider value={{ locale: settings.locale, timezone: settings.timezone }}><RouteAwareAppShell
      appRootPaths={apps.map((app) => app.rootPath)}
      /* The top bar is one 46px line and the app chip beside it already names
         the application, so the mark stays compact in both rail states: the
         configured brand image, or a mono monogram on its own baseline —
         no chip, no box. */
      brand={settings.brandMarkUrl ? (
        <Link href="/" aria-label={`Open ${settings.appTitle} home`} className="flex items-center rounded-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus">
          <img src={settings.brandMarkUrl} alt={settings.appTitle} className="h-6 w-auto max-w-24 object-contain" />
        </Link>
      ) : (
        <Link href="/" aria-label={`Open ${settings.appTitle} home`} className="flex items-center rounded-action px-0.5 font-ui-mono text-xs font-medium tracking-[0.16em] text-ink no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus">
          {appAbbreviation ?? productMark}
        </Link>
      )}
      collapsible
      navigationLabel={`${settings.appTitle} navigation`}
      navigation={<AuthenticatedPlatformNavigation domainNavigation={domainNavigation} />}
      utility={domainUtilityNavigation}
      /* DESIGN v2 §10.1-10.2 (owner decision 1): the account and the General group live in the rail;
         search, messages and notifications stay in the thin top bar. */
      railHeader={<RailAccount name={principal.displayName} detail={settings.organizationName || settings.appTitle} />}
      railFooter={<RailGeneral logoutAction={logoutAction} showSettings={showSettings} />}
      /* Prototype `.a-top` order: mark, app chip, search, then the personal
         controls pinned right. The search grows to its own 300px cap and the
         personal group's auto margin takes the remainder, so the field keeps
         its width instead of being pushed about by the account menu. On a
         phone the cap lifts and the field takes the whole gap (a spacer here
         used to split it, leaving one visible letter). */
      topbar={<div className="flex w-full items-center gap-2.5">
        <HeaderApplicationNavigation apps={apps} />
        {contextSlot}
        <div className="ml-auto flex shrink-0 items-center gap-2.5">
          <QuickMessenger />
          <NotificationBell />
          {/* A phone has no rail column, so the account menu stays here below 840px. A surface without a rail
              (Settings, Account) keeps it at every width. */}
          <TopbarAccount
            appRootPaths={apps.map((app) => app.rootPath)}
            name={principal.displayName}
            logoutAction={logoutAction}
            showSettings={showSettings}
          />
        </div>
      </div>}
    >
      {children}
    </RouteAwareAppShell></DisplaySettingsProvider>
  );
}
