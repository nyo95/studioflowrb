import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AuthenticatedShell, type ShellAreaBrand } from "@/platform/authenticated-shell";
import { requirePrincipalGrants } from "@platform/core/auth";
import { prisma } from "@platform/core/db";
import { enabledModuleIds } from "@platform/core/modules";
import { hasPermission } from "@platform/core/rbac";
import { getPermissionRegistry } from "@platform/core/rbac/registry";
import { readPlatformGeneralSettings } from "@platform/core/settings";
import { brandMarkStorage, objectStorage, userPreferences, userTutorials } from "@platform/runtime";
import { validateAppTutorial } from "@platform/core/tutorials";
import { readBqIssuerIdentity } from "@/apps/bq/public";
import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/public";
import { STUDIOFLOW_PERMISSIONS, STUDIOFLOW_TOUR, readStudioFlowDocumentIdentity } from "@/apps/studioflow/public";
import { studioFlow, studioFlowSampleRequestRead } from "@/apps/studioflow/runtime";
import { recordTutorialAction, setGuideLanguageAction } from "./account/actions";
import { logoutAction } from "./logout-action";
import { BqNav } from "./bq/nav";
import { StudioFlowHeaderSearch } from "./studioflow/header-search";
import { StudioFlowNav, StudioFlowUtilityNav } from "./studioflow/nav";
import { MasterDataNav, MasterDataUtilityNav } from "./masterdata/nav";
import { masterDataSettingsGroups } from "./masterdata/settings/sections";
import { firstSettingsHref } from "./settings/settings-sections";
import { studioFlowSettingsGroups } from "./studioflow/settings/sections";

export const dynamic = "force-dynamic";

/** A shell mark link is long-lived (stable since R9.82), so a page left open keeps its logo. */
const AREA_LOGO_LINK_SECONDS = 12 * 60 * 60;

/**
 * Brand by role (owner 2026-10-15): the contractor identity (BQ's issuer) marks BQ and Master Data, the consultant
 * identity (StudioFlow's letterhead) marks StudioFlow. An identity with neither name nor logo leaves the platform mark.
 */
async function areaBrands(): Promise<ShellAreaBrand[]> {
  const [contractor, consultant] = await Promise.all([readBqIssuerIdentity(prisma), readStudioFlowDocumentIdentity(prisma)]);
  const areas = [
    { identity: contractor, rootPaths: ["/bq", "/masterdata"] },
    { identity: consultant, rootPaths: ["/studioflow"] },
  ];
  return Promise.all(areas
    .filter(({ identity }) => identity.companyName || identity.logoKey)
    .map(async ({ identity, rootPaths }) => ({
      rootPaths,
      name: identity.companyName ?? "",
      logoUrl: identity.logoKey ? await objectStorage.createSignedReadUrl(identity.logoKey, AREA_LOGO_LINK_SECONDS).catch(() => null) : null,
    })));
}

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { principal, grants } = principalGrants;
  const canManageSampleRequests = hasPermission(grants, MASTERDATA_PERMISSIONS.sampleRequestManage);
  const display = await userPreferences.resolveDisplay({ userId: principal.userId });
  const [settings, tutorial, waitingOnYou, openSampleRequests, enabledModules, brands] = await Promise.all([
    readPlatformGeneralSettings(prisma, (key) => brandMarkStorage.createPublicReadUrl(key)),
    userTutorials.getShellState({ userId: principal.userId, language: display.language }),
    grants.includes("studioflow.access") ? studioFlow.projects.countWaitingOnYou({ grants, actorId: principal.userId }) : Promise.resolve(0),
    canManageSampleRequests ? studioFlowSampleRequestRead.countPendingSampleRequests() : Promise.resolve(0),
    enabledModuleIds(),
    areaBrands(),
  ]);
  const apps = getPermissionRegistry().apps
    .filter((app) => grants.includes(app.accessPermission))
    .map(({ appId, name, rootPath, icon }) => ({ appId, name, rootPath, icon }));

  const domainNavigation = <>
    {apps.some((app) => app.appId === "masterdata") ? <MasterDataNav canManageSampleRequests={canManageSampleRequests} canReadSamples={hasPermission(grants, MASTERDATA_PERMISSIONS.sampleRead)} openSampleRequests={openSampleRequests} canUseWorkbook={(hasPermission(grants, MASTERDATA_PERMISSIONS.skuRead) && hasPermission(grants, MASTERDATA_PERMISSIONS.priceMaterialRead)) || (hasPermission(grants, MASTERDATA_PERMISSIONS.skuManage) && hasPermission(grants, MASTERDATA_PERMISSIONS.priceMaterialManage))} /> : null}
    {apps.some((app) => app.appId === "bq") ? <BqNav /> : null}
    {apps.some((app) => app.appId === "studioflow") ? <StudioFlowNav waitingOnYou={waitingOnYou} enabledModuleIds={enabledModules} canUseIdeas={hasPermission(grants, STUDIOFLOW_PERMISSIONS.ideasManage)} /> : null}
  </>;

  // Each app's Settings sits in the rail's utility area; each component renders only inside its own app.
  const domainUtilityNavigation = <>
    {apps.some((app) => app.appId === "masterdata") ? <MasterDataUtilityNav canOpenSettings={firstSettingsHref(masterDataSettingsGroups(grants)) !== null} /> : null}
    {apps.some((app) => app.appId === "studioflow") ? <StudioFlowUtilityNav canOpenSettings={firstSettingsHref(studioFlowSettingsGroups(grants)) !== null} /> : null}
  </>;

  // Each app registers its own first-use tour; the shell plays the one for the app the person is in.
  const tours = apps.some((app) => app.appId === "studioflow") ? [{ appRootPath: "/studioflow", tour: validateAppTutorial(STUDIOFLOW_TOUR) }] : [];

  const contextSlot = apps.some((app) => app.appId === "studioflow") ? <StudioFlowHeaderSearch /> : null;

  return <AuthenticatedShell principal={principal} grants={grants} settings={{ ...settings, ...display }} apps={apps} logoutAction={logoutAction} domainNavigation={domainNavigation} domainUtilityNavigation={domainUtilityNavigation} contextSlot={contextSlot} areaBrands={brands} tours={tours} tutorial={tutorial} tourActions={{ record: recordTutorialAction, setLanguage: setGuideLanguageAction }}>
    {children}
  </AuthenticatedShell>;
}
