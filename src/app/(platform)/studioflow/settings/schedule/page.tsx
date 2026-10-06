import { hasPermission } from "@platform/core/rbac";
import { STUDIOFLOW_PERMISSIONS as P } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { SettingsFrame } from "@/app/(platform)/settings/settings-navigation";
import { canOpenSettingsSection } from "@/app/(platform)/settings/settings-sections";

import { pageSession } from "../../_components/session";
import { STUDIOFLOW_SETTINGS_TRAIL, studioFlowSettingsGroups } from "../sections";
import { ScheduleTemplatesView } from "./schedule-templates-view";

export const dynamic = "force-dynamic";

export default async function ScheduleTemplatesPage() {
  const { grants } = await pageSession();
  const groups = studioFlowSettingsGroups(grants);
  const allowed = canOpenSettingsSection(groups, "schedule");
  const [scheduleTemplates, schedulePrefixes, brands] = allowed
    ? await Promise.all([studioFlow.schedule.listTemplates({ grants }), studioFlow.schedule.listPrefixes({ grants }), studioFlow.schedule.listBrandChoices({ grants })])
    : [[], [], []];
  return (
    <SettingsFrame appMark="SF" trail={STUDIOFLOW_SETTINGS_TRAIL} title="Schedule templates" description="The standard Product Schedule that repeats in every standard project." groups={groups} active="schedule">
      <ScheduleTemplatesView scheduleTemplates={scheduleTemplates} schedulePrefixes={schedulePrefixes} brands={brands} canManage={hasPermission(grants, P.settingsManage)} />
    </SettingsFrame>
  );
}
