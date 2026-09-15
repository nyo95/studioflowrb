import { studioFlow } from "@/apps/studioflow/runtime";
import { EmptyState, SectionCard } from "@/platform/ui_engine";

import { pageSession } from "../../../_components/session";
import { HistoryList } from "./history-list";

export const dynamic = "force-dynamic";

export default async function ProjectHistoryPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { grants } = await pageSession();
  const events = await studioFlow.projects.getProjectHistory({ grants, projectId });
  return (
    <SectionCard title="History" description="Every recorded change on this project, newest first." padded>
      {events.length === 0 ? <EmptyState title="No history yet" /> : <HistoryList events={events} />}
    </SectionCard>
  );
}
