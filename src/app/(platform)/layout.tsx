import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AuthenticatedShell } from "@/platform/authenticated-shell";
import { requirePrincipalGrants } from "@platform/core/auth";
import { prisma } from "@platform/core/db";
import { hasPermission } from "@platform/core/rbac";
import { getPermissionRegistry } from "@platform/core/rbac/registry";
import { readPlatformGeneralSettings } from "@platform/core/settings";
import { brandMarkStorage } from "@platform/runtime";
import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/public";
import { logoutAction } from "./logout-action";
import { BqNav } from "./bq/nav";
import { StudioFlowHeaderSearch } from "./studioflow/header-search";
import { StudioFlowNav, StudioFlowUtilityNav } from "./studioflow/nav";
import { MasterDataNav } from "./masterdata/nav";

export const dynamic = "force-dynamic";

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { principal, grants } = principalGrants;
  const settings = await readPlatformGeneralSettings(prisma, (key) => brandMarkStorage.createPublicReadUrl(key));
  const apps = getPermissionRegistry().apps
    .filter((app) => grants.includes(app.accessPermission))
    .map(({ appId, name, rootPath, icon }) => ({ appId, name, rootPath, icon }));

  const domainNavigation = <>
    {apps.some((app) => app.appId === "masterdata") ? <MasterDataNav canManageSampleRequests={hasPermission(grants, MASTERDATA_PERMISSIONS.sampleRequestManage)} /> : null}
    {apps.some((app) => app.appId === "bq") ? <BqNav /> : null}
    {apps.some((app) => app.appId === "studioflow") ? <StudioFlowNav /> : null}
  </>;

  const domainUtilityNavigation = apps.some((app) => app.appId === "studioflow")
    ? <StudioFlowUtilityNav />
    : null;

  const contextSlot = apps.some((app) => app.appId === "studioflow") ? <StudioFlowHeaderSearch /> : null;

  return <AuthenticatedShell principal={principal} grants={grants} settings={settings} apps={apps} logoutAction={logoutAction} domainNavigation={domainNavigation} domainUtilityNavigation={domainUtilityNavigation} contextSlot={contextSlot}>
    {children}
  </AuthenticatedShell>;
}
