import { redirect, notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Circle, FileText, Link2 } from "lucide-react";
import Link from "next/link";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import {
  Badge,
  EmptyState,
  PageHeader,
  SectionCard,
} from "@/platform/ui_engine";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/service";
import { studioFlowService } from "@/apps/studioflow/runtime";

export const dynamic = "force-dynamic";

export default async function PhaseRequirementsPage({
  params,
}: {
  params: Promise<{ id: string; phaseId: string }>;
}) {
  const { id, phaseId } = await params;
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;

  const canRead = hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectRead);
  if (!canRead) redirect(`/studioflow/${id}`);

  let project;
  try {
    project = await studioFlowService.getProject(grants, id);
  } catch {
    notFound();
  }

  if (project.deleted_at) redirect(`/studioflow/${id}`);

  let phase;
  try {
    phase = await studioFlowService.getPhase(grants, id, phaseId);
  } catch {
    notFound();
  }

  const requirements = await studioFlowService.listPhaseRequirements(grants, id, phaseId);

  return (
    <>
      <PageHeader
        eyebrow={`${project.name} \u2014 ${phase.name}`}
        title="Phase Requirements"
        description={`Requirements specific to the ${phase.name} phase.`}
        divider
        actions={
          <Link
            href={`/studioflow/${id}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-line-subtle px-3 py-1.5 text-sm font-medium text-ink-secondary hover:bg-surface-muted"
          >
            <ArrowLeft className="size-4" /> Back to project
          </Link>
        }
      />

      <div className="px-6 py-4">
        <SectionCard
          title={`${phase.name} Requirements`}
          count={requirements.length}
          padded={false}
        >
          {requirements.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No phase requirements"
              description="Phase requirements will appear here once seeded from templates or created manually."
            />
          ) : (
            <ol className="m-0 list-none p-0">
              {requirements.map((req) => (
                <li
                  key={req.id}
                  className="flex items-start gap-3 border-b border-line-subtle px-3.5 py-3 last:border-0"
                >
                  <div className="mt-0.5">
                    {req.satisfaction_state === "SATISFIED" ? (
                      <CheckCircle2 className="size-4 text-green-600" />
                    ) : (
                      <Circle className="size-4 text-ink-tertiary" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{req.title}</span>
                      <Badge>{req.satisfaction_state}</Badge>
                    </div>
                    {req.description ? (
                      <p className="mt-0.5 text-sm text-ink-secondary">{req.description}</p>
                    ) : null}
                    {req.satisfaction_state === "SATISFIED" && req.satisfaction_note ? (
                      <p className="mt-1 text-xs text-ink-tertiary">
                        Note: {req.satisfaction_note}
                      </p>
                    ) : null}
                    {req.evidence.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {req.evidence.map((ev) => (
                          <Badge key={ev.id} className="gap-1">
                            <Link2 className="size-3" />
                            {ev.file.filename}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </SectionCard>
      </div>
    </>
  );
}
