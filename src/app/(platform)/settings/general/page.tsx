import { redirect } from "next/navigation";

import { ErrorState, PageHeader, PageShell, SectionCard } from "@/platform/ui_engine";
import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { toSafeErrorPayload, type SafeErrorPayload } from "@platform/core/errors";
import { platformSettings } from "@platform/runtime";
import type { PlatformGeneralSettings } from "@platform/core/settings";
import { GeneralSettingsForm } from "./general-settings-form";

export const dynamic = "force-dynamic";

export default async function GeneralSettingsPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;

  if (!hasPermission(grants, "platform.settings.read")) {
    return (
      <PageShell>
        <PageHeader eyebrow="Settings" title="General Settings" />
        <SectionCard>
          <ErrorState title="Access denied" description="You do not have permission to view platform settings." />
        </SectionCard>
      </PageShell>
    );
  }

  let settings: PlatformGeneralSettings | undefined;
  let failure: SafeErrorPayload | undefined;
  try {
    settings = await platformSettings.read({ grants });
  } catch (error) {
    failure = toSafeErrorPayload(error);
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Settings"
        title="General Settings"
        description="Shared display defaults for every application."
      />
      {failure ? (
        <SectionCard>
          <ErrorState title="Unable to load settings" description={failure.safeMessage} />
        </SectionCard>
      ) : (
        <GeneralSettingsForm settings={settings as PlatformGeneralSettings} canManage={hasPermission(grants, "platform.settings.manage")} />
      )}
    </PageShell>
  );
}
