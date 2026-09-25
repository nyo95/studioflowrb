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
  /* No PageShell here. It is a centred, max-width, padded CSS grid, and
     wrapping every StudioFlow route in one made a full-bleed, viewport-tall
     project workspace impossible: `flex-1` is inert inside a grid parent, so
     the secondary rail could not be given a constrained height and its sticky
     context bar never worked (the R8.152 regression, reverted in R8.153).
     Each page now owns its own measure, and the project workspace applies
     PageShell inside its content column — which is what the prototype does:
     `.a-main` is full-bleed and `.a-measure` sits inside it. */
  return <>{children}</>;
}
