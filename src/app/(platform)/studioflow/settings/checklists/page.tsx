import { hasPermission } from "@platform/core/rbac";
import { STUDIOFLOW_PERMISSIONS as P } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { SettingsFrame } from "@/app/(platform)/settings/settings-navigation";
import { canOpenSettingsSection } from "@/app/(platform)/settings/settings-sections";

import { pageSession } from "../../_components/session";
import { STUDIOFLOW_SETTINGS_TRAIL, studioFlowSettingsGroups } from "../sections";
import { ChecklistTemplatesView } from "../template-views";

export const dynamic = "force-dynamic";

export default async function ChecklistTemplatesPage() {
  const { grants } = await pageSession();
  const groups = studioFlowSettingsGroups(grants);
  const allowed = canOpenSettingsSection(groups, "checklists");
  const [templates, phaseTemplates] = allowed
    ? await Promise.all([studioFlow.tasks.listTemplates({ grants, includeInactive: true }), studioFlow.phases.listPhaseTemplates({ grants })])
    : [[], []];
  const defaultTemplate = phaseTemplates.find((template) => template.isDefault && template.isActive);
  return (
    <SettingsFrame appMark="SF" trail={STUDIOFLOW_SETTINGS_TRAIL} title="Checklist templates" description="The items every new project's checklists start with." groups={groups} active="checklists">
      <ChecklistTemplatesView
        templates={templates}
        phases={(defaultTemplate?.definitions ?? []).map((definition) => ({ id: definition.id, label: definition.name }))}
        canManage={hasPermission(grants, P.settingsManage)}
      />
    </SettingsFrame>
  );
}
