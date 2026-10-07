import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AuthenticatedShell } from "@/platform/authenticated-shell";
import { requirePrincipalGrants } from "@platform/core/auth";
import { prisma } from "@platform/core/db";
import { hasPermission } from "@platform/core/rbac";
import { getPermissionRegistry } from "@platform/core/rbac/registry";
import { readPlatformGeneralSettings } from "@platform/core/settings";
import { brandMarkStorage, userPreferences } from "@platform/runtime";
import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/public";
import { studioFlow, studioFlowSampleRequestRead } from "@/apps/studioflow/runtime";
import { logoutAction } from "./logout-action";
import { BqNav } from "./bq/nav";
import { StudioFlowHeaderSearch } from "./studioflow/header-search";
import { StudioFlowNav, StudioFlowUtilityNav } from "./studioflow/nav";
import { MasterDataNav, MasterDataUtilityNav } from "./masterdata/nav";
import { masterDataSettingsGroups } from "./masterdata/settings/sections";
import { firstSettingsHref } from "./settings/settings-sections";
import { studioFlowSettingsGroups } from "./studioflow/settings/sections";

export const dynamic = "force-dynamic";

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { principal, grants } = principalGrants;
  const canManageSampleRequests = hasPermission(grants, MASTERDATA_PERMISSIONS.sampleRequestManage);
  const [settings, display, studioFlowStats, openSampleRequests] = await Promise.all([
    readPlatformGeneralSettings(prisma, (key) => brandMarkStorage.createPublicReadUrl(key)),
    userPreferences.resolveDisplay({ userId: principal.userId }),
    grants.includes("studioflow.access") ? studioFlow.projects.getHomeStats({ grants, filter: "mine", actorId: principal.userId }) : Promise.resolve(null),
    canManageSampleRequests ? studioFlowSampleRequestRead.countPendingSampleRequests() : Promise.resolve(0),
  ]);
  const apps = getPermissionRegistry().apps
    .filter((app) => grants.includes(app.accessPermission))
    .map(({ appId, name, rootPath, icon }) => ({ appId, name, rootPath, icon }));

  const domainNavigation = <>
    {apps.some((app) => app.appId === "masterdata") ? <MasterDataNav canManageSampleRequests={canManageSampleRequests} canReadSamples={hasPermission(grants, MASTERDATA_PERMISSIONS.sampleRead)} openSampleRequests={openSampleRequests} canUseWorkbook={(hasPermission(grants, MASTERDATA_PERMISSIONS.skuRead) && hasPermission(grants, MASTERDATA_PERMISSIONS.priceMaterialRead)) || (hasPermission(grants, MASTERDATA_PERMISSIONS.skuManage) && hasPermission(grants, MASTERDATA_PERMISSIONS.priceMaterialManage))} /> : null}
    {apps.some((app) => app.appId === "bq") ? <BqNav /> : null}
    {apps.some((app) => app.appId === "studioflow") ? <StudioFlowNav waitingOnYou={studioFlowStats?.waitingOnYou ?? 0} /> : null}
  </>;

  // Each app's Settings sits in the rail's utility area; each component renders only inside its own app.
  const domainUtilityNavigation = <>
    {apps.some((app) => app.appId === "masterdata") ? <MasterDataUtilityNav canOpenSettings={firstSettingsHref(masterDataSettingsGroups(grants)) !== null} /> : null}
    {apps.some((app) => app.appId === "studioflow") ? <StudioFlowUtilityNav canOpenSettings={firstSettingsHref(studioFlowSettingsGroups(grants)) !== null} /> : null}
  </>;

  const contextSlot = apps.some((app) => app.appId === "studioflow") ? <StudioFlowHeaderSearch /> : null;

  return <AuthenticatedShell principal={principal} grants={grants} settings={{ ...settings, ...display }} apps={apps} logoutAction={logoutAction} domainNavigation={domainNavigation} domainUtilityNavigation={domainUtilityNavigation} contextSlot={contextSlot}>
    {children}
  </AuthenticatedShell>;
}
