import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { PageShell } from "@/platform/ui_engine";
import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/service";

export const dynamic = "force-dynamic";

export default async function MasterDataLayout({ children }: { children: ReactNode }) {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  if (!hasPermission(principalGrants.grants, MASTERDATA_PERMISSIONS.access)) redirect("/");

  return (
    <PageShell size="wide">
      {children}
    </PageShell>
  );
}
