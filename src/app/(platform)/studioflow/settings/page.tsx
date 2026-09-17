import { hasPermission } from "@platform/core/rbac";
import { PHASE_BLUEPRINT } from "@/apps/studioflow/domain/phase";
import { STUDIOFLOW_PERMISSIONS as P } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { PageHeader } from "@/platform/ui_engine";

import { pageSession } from "../_components/session";
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
  return (
    <>
      <PageHeader eyebrow="StudioFlow" title="Studio Settings" description="How projects are named and which checklist every project gets." divider />
      <StudioSettingsView
        autoNaming={settings.autoNamingEnabled}
        templates={templates}
        scheduleTemplates={scheduleTemplates}
        schedulePrefixes={schedulePrefixes}
        brands={brands}
        phases={PHASE_BLUEPRINT.map((p) => ({ key: p.key, label: p.label }))}
        phaseTemplates={phaseTemplates}
        canManage={hasPermission(grants, P.settingsManage)}
      />
    </>
  );
}
