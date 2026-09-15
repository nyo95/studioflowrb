import { studioFlow } from "@/apps/studioflow/runtime";
import { SectionCard } from "@/platform/ui_engine";

import { pageSession } from "../../../_components/session";
import { ScheduleBoard } from "./schedule-board";

export const dynamic = "force-dynamic";

export default async function ProjectSchedulePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { grants } = await pageSession();
  const [project, entries, brands] = await Promise.all([
    studioFlow.projects.getProject({ grants, projectId }),
    studioFlow.schedule.listSchedule({ grants, projectId }),
    studioFlow.schedule.listBrandChoices({ grants }),
  ]);
  const canEdit = studioFlow.schedule.canManage(grants) && project.archivedAt === null;

  return (
    <SectionCard title="Product Schedule" description="Materials and fixtures specified for this project, each with its options and the chosen final one." count={entries.length} padded={false}>
      <ScheduleBoard projectId={projectId} entries={entries} brands={brands} canEdit={canEdit} />
    </SectionCard>
  );
}
