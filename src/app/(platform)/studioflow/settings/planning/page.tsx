import { hasPermission } from "@platform/core/rbac";
import { STUDIOFLOW_PERMISSIONS as P } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { SettingsFrame } from "@/app/(platform)/settings/settings-navigation";
import { canOpenSettingsSection } from "@/app/(platform)/settings/settings-sections";

import { pageSession } from "../../_components/session";
import { STUDIOFLOW_SETTINGS_TRAIL, studioFlowSettingsGroups } from "../sections";
import { PlanningSettings } from "./planning-settings";

export const dynamic = "force-dynamic";

export default async function PlanningSettingsPage() {
  const { grants } = await pageSession();
  const groups = studioFlowSettingsGroups(grants);
  const allowed = canOpenSettingsSection(groups, "planning");
  const [settings, holidays] = allowed
    ? await Promise.all([studioFlow.projects.getStudioSettings({ grants }), studioFlow.projects.listHolidays({ grants })])
    : [null, []];
  return (
    <SettingsFrame appMark="SF" trail={STUDIOFLOW_SETTINGS_TRAIL} title="Planning and holidays" description="Working days and standard lead times used to plan a project backward and forward from its Fit Out Start." groups={groups} active="planning">
      {settings ? (
        <PlanningSettings
          intervals={{ cdMall: settings.cdMall, cdFinal: settings.cdFinal, gap: settings.gap, fitOutToHandover: settings.fitOutToHandover, handoverToOpening: settings.handoverToOpening }}
          holidays={holidays}
          canManage={hasPermission(grants, P.settingsManage)}
        />
      ) : null}
    </SettingsFrame>
  );
}
