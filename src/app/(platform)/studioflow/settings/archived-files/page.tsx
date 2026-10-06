import { hasPermission } from "@platform/core/rbac";
import { STUDIOFLOW_PERMISSIONS as P } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { SettingsFrame } from "@/app/(platform)/settings/settings-navigation";
import { canOpenSettingsSection } from "@/app/(platform)/settings/settings-sections";

import { pageSession } from "../../_components/session";
import { STUDIOFLOW_SETTINGS_TRAIL, studioFlowSettingsGroups } from "../sections";
import { ArchiveRetentionSettings } from "./archive-retention-settings";

export const dynamic = "force-dynamic";

export default async function ArchivedFilesSettingsPage() {
  const { grants } = await pageSession();
  const groups = studioFlowSettingsGroups(grants);
  const settings = canOpenSettingsSection(groups, "archived-files") ? await studioFlow.projects.getStudioSettings({ grants }) : null;
  return (
    <SettingsFrame appMark="SF" trail={STUDIOFLOW_SETTINGS_TRAIL} title="Archived files" description="How long an archived project keeps its files before they are cleaned up." groups={groups} active="archived-files">
      {settings ? <ArchiveRetentionSettings retentionDays={settings.archiveRetentionDays} canManage={hasPermission(grants, P.settingsManage)} canCleanup={hasPermission(grants, P.projectManage)} /> : null}
    </SettingsFrame>
  );
}
