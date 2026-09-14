import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Settings } from "lucide-react";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { Badge, EmptyState, PageHeader, SectionCard } from "@/platform/ui_engine";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/service";
import { studioFlowService } from "@/apps/studioflow/runtime";
import { RequirementTemplateActions } from "../../../requirements/template-actions";
import { EditRequirementTemplateForm } from "../../../requirements/template-form";

export const dynamic = "force-dynamic";

export default async function PhaseTemplateRequirementsPage({
  params,
}: {
  params: Promise<{ phaseTemplateId: string }>;
}) {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;
  const canRead = hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectRead);
  const canManage = hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectManage);

  if (!canRead) {
    return (
      <>
        <PageHeader eyebrow="StudioFlow" title="Phase Requirements" divider />
        <SectionCard>
          <EmptyState icon={Settings} title="Access denied" description="You do not have permission to view phase requirements." />
        </SectionCard>
      </>
    );
  }

  const { phaseTemplateId } = await params;
  const result = await studioFlowService.listPhaseRequirementTemplates(grants, phaseTemplateId).catch(() => null);
  if (!result) redirect("/studioflow/settings/requirements");

  return (
    <>
      <PageHeader
        eyebrow="StudioFlow · Phase template"
        title={`${result.phaseTemplate.name} Requirements`}
        description={`Requirements seeded when the ${result.phaseTemplate.name} phase is added to a project.`}
        divider
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/studioflow/settings/requirements" className="inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink">
              <ArrowLeft className="size-4" /> All requirement templates
            </Link>
            {canManage ? <Link href={`/studioflow/settings/requirements/new?phase_template_id=${result.phaseTemplate.id}`} className="inline-flex items-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-on-ink hover:bg-ink/90"><Plus className="size-4" /> New Phase Requirement</Link> : null}
          </div>
        }
      />
      <div className="px-6 py-4">
        <SectionCard title={result.phaseTemplate.name} count={result.templates.length} padded={false}>
          {result.templates.length === 0 ? (
            <EmptyState icon={Settings} title="No phase requirements" description="No requirements are assigned to this phase template." />
          ) : (
            <ol className="m-0 list-none p-0">
              {result.templates.map((template) => (
                <li key={template.id} className="flex items-center gap-3 border-b border-line-subtle px-3.5 py-2.5 last:border-0">
                  <span className="font-ui-mono text-[0.6875rem] text-ink-tertiary tabular-nums">{template.sort_order}</span>
                  <div className="grid min-w-0 flex-1 gap-px">
                    <span className="truncate text-sm font-semibold">{template.title}</span>
                    <span className="font-ui-mono text-[0.6875rem] text-ink-tertiary">{template.key}</span>
                  </div>
                  {canManage && !template.deleted_at ? <EditRequirementTemplateForm template={template} /> : null}
                  {template.deleted_at ? <Badge tone="warning">Archived</Badge> : null}
                  {template.key_immutable ? <Badge>In use</Badge> : null}
                  {canManage ? <RequirementTemplateActions templateId={template.id} archived={Boolean(template.deleted_at)} canDelete={!template.key_immutable} /> : null}
                </li>
              ))}
            </ol>
          )}
        </SectionCard>
      </div>
    </>
  );
}
