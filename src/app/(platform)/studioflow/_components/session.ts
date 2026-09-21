import "server-only";

import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";

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
