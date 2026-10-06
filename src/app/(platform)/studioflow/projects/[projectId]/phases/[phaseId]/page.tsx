import { redirect } from "next/navigation";

import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public";

export default async function PhasePage({ params }: { params: Promise<{ projectId: string; phaseId: string }> }) {
  const { projectId, phaseId } = await params;
  redirect(STUDIOFLOW_ROUTES.projectPhase(projectId, phaseId));
}
