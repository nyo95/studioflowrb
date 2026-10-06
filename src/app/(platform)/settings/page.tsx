import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";

import { firstSettingsHref, platformSettingsGroups } from "./settings-sections";

export const dynamic = "force-dynamic";

/** Platform settings root: open the first platform page this person may use; anyone else goes home. */
export default async function PlatformSettingsIndex() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  redirect(firstSettingsHref(platformSettingsGroups(principalGrants.grants)) ?? "/");
}
