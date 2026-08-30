import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AuthenticatedShell } from "@/platform/authenticated-shell";
import { ErrorState, PageShell } from "@/platform/ui_engine";
import { logoutAction } from "@/app/(platform)/logout-action";
import { requireMasterDataRequestContext } from "@masterdata/infrastructure/request-context";
import { requirePrincipalGrants } from "@platform/core/auth";
import { prisma } from "@platform/core/db";
import { AppError } from "@platform/core/errors";
import { getPermissionRegistry } from "@platform/core/rbac/registry";
import { readPlatformGeneralSettings } from "@platform/core/settings";
import { MasterDataNavigation, MasterDataUtilityNavigation } from "./masterdata-navigation";
import { MasterDataTopbar } from "./masterdata-topbar";

export const dynamic = "force-dynamic";

export default async function MasterDataLayout({ children }: { children: ReactNode }) {
  try {
    await requireMasterDataRequestContext();
  } catch (error) {
    if (error instanceof AppError && error.kind === "UNAUTHENTICATED") redirect("/login");
    if (error instanceof AppError && error.kind === "FORBIDDEN") {
      return <PageShell><ErrorState title="No access to Master Data" description="Your account does not have the masterdata.access permission." /></PageShell>;
    }
    throw error;
  }

  const { principal, grants } = await requirePrincipalGrants();
  const settings = await readPlatformGeneralSettings(prisma);
  const apps = getPermissionRegistry().apps
    .filter((app) => grants.includes(app.accessPermission))
    .map(({ appId, name, rootPath }) => ({ appId, name, rootPath }));

  return <AuthenticatedShell
    principal={principal}
    grants={grants}
    settings={settings}
    apps={apps}
    logoutAction={logoutAction}
    appName="Master Data"
    appAbbreviation="MD"
    domainNavigation={<MasterDataNavigation />}
    domainUtilityNavigation={<MasterDataUtilityNavigation />}
    contextSlot={<MasterDataTopbar />}
  >
    {children}
  </AuthenticatedShell>;
}
