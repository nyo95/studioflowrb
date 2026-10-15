import { RailAccount, RailGeneral, TopbarAccount } from "./account-menu";

import { DisplaySettingsProvider } from "./display-settings";

import { NotificationBell } from "./notification-bell";
import { QuickMessenger } from "./quick-messenger";


import type { ReactNode } from "react";


import type { SessionPrincipal } from "@platform/core/auth";

import type { PlatformGeneralSettings } from "@platform/core/settings";


import { AuthenticatedPlatformNavigation,HeaderApplicationNavigation,type ShellAppLink } from "./navigation";
import { RouteAwareAppShell } from "./route-aware-app-shell";
import { brandMark, type ShellAreaBrand } from "./brand-rules";
import { ShellBrand } from "./shell-brand";

export type { ShellAreaBrand } from "./brand-rules";
import { getSettingsMenuVisibility } from "./shell-rules";
import { TourProvider, type TourActions } from "./tour";
import type { ShellTour } from "./tour-rules";
import type { ShellTutorialState } from "@platform/core/tutorials";


export function AuthenticatedShell({ principal, grants, settings, apps, logoutAction, appAbbreviation, domainNavigation, domainUtilityNavigation, contextSlot, areaBrands = [], tours = [], tutorial = { language: null, tutorials: [] }, tourActions, children }: {
  principal: SessionPrincipal;
  grants: readonly string[];
  settings: PlatformGeneralSettings;
  apps: readonly ShellAppLink[];
  logoutAction: () => Promise<void>;
  appAbbreviation?: string;
  domainNavigation?: ReactNode;
  domainUtilityNavigation?: ReactNode;
  contextSlot?: ReactNode;
  /** Identities that replace the platform mark inside their areas (owner 2026-10-15); outside them the platform mark shows. */
  areaBrands?: readonly ShellAreaBrand[];
  /** Each app's first-use tour (app-owned), plus this person's guide language and progress. */
  tours?: readonly ShellTour[];
  tutorial?: ShellTutorialState;
  tourActions: TourActions;
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
    <DisplaySettingsProvider value={{ locale: settings.locale, timezone: settings.timezone }}><TourProvider tours={tours} grants={grants} language={tutorial.language} progress={tutorial.tutorials} actions={tourActions}><RouteAwareAppShell
      appRootPaths={apps.map((app) => app.rootPath)}
      brand={<ShellBrand appTitle={settings.appTitle} logoUrl={settings.brandMarkUrl ?? null} monogram={appAbbreviation ?? productMark} areas={areaBrands} />}
      collapsible
      navigationLabel={`${settings.appTitle} navigation`}
      navigation={<AuthenticatedPlatformNavigation domainNavigation={domainNavigation} apps={apps} />}
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
    </RouteAwareAppShell></TourProvider></DisplaySettingsProvider>
  );
}
