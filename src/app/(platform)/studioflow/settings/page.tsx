import { hasPermission } from "@platform/core/rbac";
import { STUDIOFLOW_PERMISSIONS as P } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { PageHeader, PageShell, SettingsShell } from "@/platform/ui_engine";

import { pageSession } from "../_components/session";
import { StudioSettingsNav } from "./studio-settings-nav";
import { StudioSettingsView } from "./studio-settings-view";

export const dynamic = "force-dynamic";

export default async function StudioSettingsPage() {
  const { grants } = await pageSession();
  const [settings, templates, scheduleTemplates, schedulePrefixes, brands, phaseTemplates] = await Promise.all([
    studioFlow.projects.getStudioSettings({ grants }),
    studioFlow.tasks.listTemplates({ grants, includeInactive: true }),
    studioFlow.schedule.listTemplates({ grants }),
    studioFlow.schedule.listPrefixes({ grants }),
    studioFlow.schedule.listBrandChoices({ grants }),
    studioFlow.phases.listPhaseTemplates({ grants }),
  ]);
  const defaultTemplate = phaseTemplates.find((template) => template.isDefault && template.isActive);
  return (
    <PageShell measure="wide">
      <PageHeader title="Studio Settings" description="How projects are named and which checklist every project gets." divider />
      <SettingsShell navigationLabel="Studio Settings navigation" navigation={<StudioSettingsNav />}>
        <StudioSettingsView
          autoNaming={settings.autoNamingEnabled}
          templates={templates}
          scheduleTemplates={scheduleTemplates}
          schedulePrefixes={schedulePrefixes}
          brands={brands}
          phases={(defaultTemplate?.definitions ?? []).map((definition) => ({ id: definition.id, label: definition.name }))}
          phaseTemplates={phaseTemplates}
          canManage={hasPermission(grants, P.settingsManage)}
        />
      </SettingsShell>
    </PageShell>
  );
}
