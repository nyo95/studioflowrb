import "server-only";

import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { studioFlow } from "@/apps/studioflow/runtime";

/** Principal + grants for StudioFlow pages; the layout already enforced access. */
export async function pageSession() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  return {
    userId: principalGrants.principal.userId,
    displayName: principalGrants.principal.displayName,
    grants: principalGrants.grants,
    actor: { kind: "USER" as const, userId: principalGrants.principal.userId, label: principalGrants.principal.displayName },
  };
}

/** What the signed-in user may edit on one project (PIC assignment + override). The single source for hiding controls. */
export async function pageProjectAccess(projectId: string) {
  const session = await pageSession();
  return studioFlow.projects.getAccess({ grants: session.grants, actor: session.actor, projectId });
}
