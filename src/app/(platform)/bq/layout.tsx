import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasAnyPermission } from "@platform/core/rbac";
import { PageShell } from "@/platform/ui_engine";
import { BQ_PERMISSIONS } from "@/apps/bq/service";

export const dynamic = "force-dynamic";

export default async function BqLayout({ children }: { children: ReactNode }) {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  if (!hasAnyPermission(principalGrants.grants, [BQ_PERMISSIONS.access, BQ_PERMISSIONS.projectDeleteApprove])) redirect("/");

  return (
    <PageShell size="wide" fill>
      {children}
    </PageShell>
  );
}
