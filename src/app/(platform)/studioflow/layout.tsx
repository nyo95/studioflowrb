import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/public";
import { ErrorState, PageShell } from "@/platform/ui_engine";

export const dynamic = "force-dynamic";

export default async function StudioFlowLayout({ children }: { children: ReactNode }) {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  if (!hasPermission(principalGrants.grants, STUDIOFLOW_PERMISSIONS.access)) redirect("/");
  if (!hasPermission(principalGrants.grants, STUDIOFLOW_PERMISSIONS.projectRead)) {
    return (
      <PageShell size="wide">
        <ErrorState title="Access denied" description="Your role can open StudioFlow but cannot read projects. Ask an administrator for project access." />
      </PageShell>
    );
  }
  return <PageShell size="wide">{children}</PageShell>;
}
