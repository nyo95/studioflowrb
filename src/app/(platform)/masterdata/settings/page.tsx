import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { firstSettingsHref } from "@/app/(platform)/settings/settings-sections";
import { ErrorState, SectionCard } from "@/platform/ui_engine";

import { masterDataSettingsGroups } from "./sections";

export const dynamic = "force-dynamic";

/** Master Data settings root: the first settings page this person may open. */
export default async function MasterDataSettingsIndex() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const first = firstSettingsHref(masterDataSettingsGroups(principalGrants.grants));
  if (first) redirect(first);
  return (
    <SectionCard>
      <ErrorState title="Access denied" description="You do not have permission to change Master Data settings." />
    </SectionCard>
  );
}
