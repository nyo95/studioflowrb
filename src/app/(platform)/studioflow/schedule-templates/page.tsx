import { hasPermission } from "@platform/core/rbac";
import { STUDIOFLOW_PERMISSIONS as P } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { PageHeader, PageShell } from "@/platform/ui_engine";

import { pageSession } from "../_components/session";
import { ScheduleTemplatesView } from "./schedule-templates-view";

export const dynamic = "force-dynamic";

export default async function ScheduleTemplatesPage() {
  const { grants } = await pageSession();
  const [scheduleTemplates, schedulePrefixes, brands] = await Promise.all([
    studioFlow.schedule.listTemplates({ grants }),
    studioFlow.schedule.listPrefixes({ grants }),
    studioFlow.schedule.listBrandChoices({ grants }),
  ]);
  return (
    <PageShell measure="wide">
      <PageHeader title="Schedule templates" description="The standard Product Schedule that repeats in every standard project." divider />
      <ScheduleTemplatesView scheduleTemplates={scheduleTemplates} schedulePrefixes={schedulePrefixes} brands={brands} canManage={hasPermission(grants, P.settingsManage)} />
    </PageShell>
  );
}
