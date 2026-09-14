import { redirect, notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import Link from "next/link";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import {
  EmptyState,
  PageHeader,
  SectionCard,
} from "@/platform/ui_engine";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/service";
import { studioFlowService } from "@/apps/studioflow/runtime";
import { RequirementCreateForm, RequirementWorkflowRow } from "./requirement-workflow";

export const dynamic = "force-dynamic";

export default async function ProjectRequirementsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;

  const canRead = hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectRead);
  const canManage = hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectManage);
  if (!canRead) redirect(`/studioflow/${id}`);

  let project;
  try {
    project = await studioFlowService.getProject(grants, id);
  } catch {
    notFound();
  }

  if (project.deleted_at) redirect(`/studioflow/${id}`);

  const [requirements, files] = await Promise.all([
    studioFlowService.listProjectRequirements(grants, id, { phaseId: null, includeArchived: true }),
    studioFlowService.listFiles(grants, id),
  ]);

  return (
    <>
      <PageHeader
        eyebrow={project.name}
        title="General Requirements"
        description="Project-scoped requirements applied to the whole project."
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
          title="General Requirements"
          count={requirements.length}
          padded={false}
        >
          {canManage ? <RequirementCreateForm projectId={id} /> : null}
          {requirements.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No general requirements"
              description="General requirements will appear here once seeded from templates or created manually."
            />
          ) : (
            <ol className="m-0 list-none p-0">{requirements.map((req) => <RequirementWorkflowRow key={req.id} projectId={id} canManage={canManage} files={files.map((file) => ({ id: file.id, filename: file.filename }))} requirement={{ ...req, archived_at: req.archived_at?.toISOString() ?? null, evidence: req.evidence.map((ev) => ({ id: ev.id, file: { id: ev.file.id, filename: ev.file.filename } })) }} />)}</ol>
          )}
        </SectionCard>
      </div>
    </>
  );
}
