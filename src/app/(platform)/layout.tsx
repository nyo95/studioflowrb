import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AuthenticatedShell } from "@/platform/authenticated-shell";
import { requirePrincipalGrants } from "@platform/core/auth";
import { prisma } from "@platform/core/db";
import { getPermissionRegistry } from "@platform/core/rbac/registry";
import { readPlatformGeneralSettings } from "@platform/core/settings";
import { logoutAction } from "./logout-action";
import { BqNav } from "./bq/nav";
import { StudioFlowNav } from "./studioflow/nav";
import { MasterDataNav } from "./masterdata/nav";

export const dynamic = "force-dynamic";

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { principal, grants } = principalGrants;
  const settings = await readPlatformGeneralSettings(prisma);
  const apps = getPermissionRegistry().apps
    .filter((app) => grants.includes(app.accessPermission))
    .map(({ appId, name, rootPath }) => ({ appId, name, rootPath }));

  const domainNavigation = <>
    {apps.some((app) => app.appId === "masterdata") ? <MasterDataNav /> : null}
    {apps.some((app) => app.appId === "bq") ? <BqNav /> : null}
    {apps.some((app) => app.appId === "studioflow") ? <StudioFlowNav /> : null}
  </>;

  return <AuthenticatedShell principal={principal} grants={grants} settings={settings} apps={apps} logoutAction={logoutAction} domainNavigation={domainNavigation}>
    {children}
  </AuthenticatedShell>;
}
