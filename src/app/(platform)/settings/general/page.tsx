import { redirect } from "next/navigation";

import { Breadcrumb, ErrorState, PageHeader, PageShell, SectionCard, SettingsShell } from "@/platform/ui_engine";
import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { toSafeErrorPayload, type SafeErrorPayload } from "@platform/core/errors";
import { platformSettings } from "@platform/runtime";
import { getPermissionRegistry } from "@platform/core/rbac/registry";
import type { PlatformGeneralSettings } from "@platform/core/settings";
import { SettingsSectionNav } from "../settings-navigation";
import { platformSettingsGroups } from "../settings-sections";
import { GeneralSettingsForm } from "./general-settings-form";

export const dynamic = "force-dynamic";

export default async function GeneralSettingsPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;

  if (!hasPermission(grants, "platform.settings.read")) {
    return (
      <PageShell>
        <PageHeader context={<Breadcrumb variant="capsule" entries={[{ label: "Home", href: "/" }, { label: "Platform settings", href: "/settings" }, { label: "General" }]} />} title="General Settings" divider />
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
    <PageShell measure="wide">
      <PageHeader
        context={<Breadcrumb variant="capsule" entries={[{ label: "Home", href: "/" }, { label: "Platform settings", href: "/settings" }, { label: "General" }]} />}
        title="General Settings"
        description="Shared display defaults and the global appearance for every application."
        divider
      />
      <SettingsShell navigation={<SettingsSectionNav groups={platformSettingsGroups(grants)} active="general" />}>
        {failure ? (
          <SectionCard>
            <ErrorState title="Unable to load settings" description={failure.safeMessage} />
          </SectionCard>
        ) : (
          <GeneralSettingsForm settings={settings as PlatformGeneralSettings} canManage={hasPermission(grants, "platform.settings.manage")} apps={apps} />
        )}
      </SettingsShell>
    </PageShell>
  );
}
