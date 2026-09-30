import { hasPermission } from "@platform/core/rbac";
import { STUDIOFLOW_PERMISSIONS as P } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { PageHeader, PageShell, SettingsShell } from "@/platform/ui_engine";

import { pageSession } from "../_components/session";
import { SettingsNavigation } from "@/app/(platform)/settings/settings-navigation";
import { StudioSettingsAnchors } from "./studio-settings-nav";
import { StudioSettingsView } from "./studio-settings-view";

export const dynamic = "force-dynamic";

export default async function StudioSettingsPage() {
  const { grants } = await pageSession();
  const [settings, templates, phaseTemplates] = await Promise.all([
    studioFlow.projects.getStudioSettings({ grants }),
    studioFlow.tasks.listTemplates({ grants, includeInactive: true }),
    studioFlow.phases.listPhaseTemplates({ grants }),
  ]);
  const defaultTemplate = phaseTemplates.find((template) => template.isDefault && template.isActive);
  return (
    <PageShell measure="wide">
      <PageHeader title="Studio Settings" description="Which checklist every project gets." divider />
      <SettingsShell navigation={<SettingsNavigation grants={grants} active="studioflow" onThisPage={<StudioSettingsAnchors />} />}>
        <StudioSettingsView
          archiveRetentionDays={settings.archiveRetentionDays}
          canManageProjects={hasPermission(grants, P.projectManage)}
          templates={templates}
          phases={(defaultTemplate?.definitions ?? []).map((definition) => ({ id: definition.id, label: definition.name }))}
          phaseTemplates={phaseTemplates}
          canManage={hasPermission(grants, P.settingsManage)}
        />
      </SettingsShell>
    </PageShell>
  );
}
