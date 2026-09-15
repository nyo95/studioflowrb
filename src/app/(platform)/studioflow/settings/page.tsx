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
  const [settings, templates] = await Promise.all([
    studioFlow.projects.getStudioSettings({ grants }),
    studioFlow.tasks.listTemplates({ grants, includeInactive: true }),
  ]);
  return (
    <>
      <PageHeader eyebrow="StudioFlow" title="Studio Settings" description="How projects are named and which checklist every project gets." divider />
      <StudioSettingsView
        autoNaming={settings.autoNamingEnabled}
        templates={templates}
        phases={PHASE_BLUEPRINT.map((p) => ({ key: p.key, label: p.label }))}
        canManage={hasPermission(grants, P.settingsManage)}
      />
    </>
  );
}
