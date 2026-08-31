import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { PageShell } from "@/platform/ui_engine";
import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/service";
import { masterDataService } from "@/apps/masterdata/runtime";

import { MasterDataNav } from "./nav";

export const dynamic = "force-dynamic";

export default async function MasterDataLayout({ children }: { children: ReactNode }) {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  if (!hasPermission(principalGrants.grants, MASTERDATA_PERMISSIONS.access)) redirect("/");

  let pendingCount = 0;
  try {
    const summary = await masterDataService.summary({ grants: principalGrants.grants });
    pendingCount = summary.deletionRequests;
  } catch {
    // If summary fails, fallback to 0
  }

  return (
    <PageShell size="wide">
      <MasterDataNav pendingDeletions={pendingCount} />
      {children}
    </PageShell>
  );
}
