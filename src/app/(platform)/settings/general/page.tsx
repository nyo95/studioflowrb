import { redirect } from "next/navigation";

import Link from "next/link";
import { ErrorState, PageHeader, PageShell, SectionCard, Notice } from "@/platform/ui_engine";
import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { toSafeErrorPayload, type SafeErrorPayload } from "@platform/core/errors";
import { platformSettings } from "@platform/runtime";
import { getPermissionRegistry } from "@platform/core/rbac/registry";
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
        <PageHeader eyebrow="Settings" title="General Settings" divider />
        <SectionCard>
          <ErrorState title="Access denied" description="You do not have permission to view platform settings." />
        </SectionCard>
      </PageShell>
    );
  }

  const apps = getPermissionRegistry().apps.map(({ appId, name }) => ({ appId, name }));

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
        divider
      />
      {hasPermission(grants, "masterdata.dictionary.read") ? <Notice title="Master Data Settings">Manage Units, Categories, Supplier Types, and protected deletion review in <Link className="underline" href="/settings/general/masterdata">Master Data Settings</Link>.</Notice> : null}
      {failure ? (
        <SectionCard>
          <ErrorState title="Unable to load settings" description={failure.safeMessage} />
        </SectionCard>
      ) : (
        <GeneralSettingsForm settings={settings as PlatformGeneralSettings} canManage={hasPermission(grants, "platform.settings.manage")} apps={apps} />
      )}
    </PageShell>
  );
}
