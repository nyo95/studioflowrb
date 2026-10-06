import { hasPermission } from "@platform/core/rbac";
import { STUDIOFLOW_PERMISSIONS as P } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { SettingsFrame } from "@/app/(platform)/settings/settings-navigation";
import { canOpenSettingsSection } from "@/app/(platform)/settings/settings-sections";

import { pageSession } from "../../_components/session";
import { STUDIOFLOW_SETTINGS_TRAIL, studioFlowSettingsGroups } from "../sections";
import { PhaseTemplatesView } from "../template-views";

export const dynamic = "force-dynamic";

export default async function PhaseTemplatesPage() {
  const { grants } = await pageSession();
  const groups = studioFlowSettingsGroups(grants);
  const allowed = canOpenSettingsSection(groups, "phases");
  const phaseTemplates = allowed ? await studioFlow.phases.listPhaseTemplates({ grants }) : [];
  return (
    <SettingsFrame appMark="SF" trail={STUDIOFLOW_SETTINGS_TRAIL} title="Phase templates" description="Which phases a new project gets. The default template is applied automatically." groups={groups} active="phases">
      <PhaseTemplatesView phaseTemplates={phaseTemplates} canManage={hasPermission(grants, P.settingsManage)} />
    </SettingsFrame>
  );
}
