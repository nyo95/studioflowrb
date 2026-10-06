import { redirect } from "next/navigation";

import { firstSettingsHref } from "@/app/(platform)/settings/settings-sections";
import { ErrorState, PageShell, SectionCard } from "@/platform/ui_engine";

import { pageSession } from "../_components/session";
import { studioFlowSettingsGroups } from "./sections";

export const dynamic = "force-dynamic";

/** StudioFlow settings root: the first settings page this person may open. */
export default async function StudioFlowSettingsIndex() {
  const { grants } = await pageSession();
  const first = firstSettingsHref(studioFlowSettingsGroups(grants));
  if (first) redirect(first);
  return (
    <PageShell measure="wide">
      <SectionCard>
        <ErrorState title="Access denied" description="You do not have permission to change StudioFlow settings." />
      </SectionCard>
    </PageShell>
  );
}
