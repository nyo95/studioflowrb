import { redirect } from "next/navigation";
import Link from "next/link";

import { ArrowLeft, Plus, Settings } from "lucide-react";

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
import { EditRequirementTemplateForm } from "./template-form";
import { RequirementTemplateActions } from "./template-actions";

export const dynamic = "force-dynamic";

export default async function RequirementTemplatesPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;

  const canRead = hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectRead);
  const canManage = hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectManage);

  if (!canRead) {
    return (
      <>
        <PageHeader eyebrow="StudioFlow" title="Requirement Templates" divider />
        <SectionCard>
          <EmptyState
            icon={Settings}
            title="Access denied"
            description="You do not have permission to view requirement templates."
          />
        </SectionCard>
      </>
    );
  }

  const templates = await studioFlowService.listRequirementTemplates(grants, { includeArchived: true });
  const phaseTemplates = await studioFlowService.listPhaseTemplates(grants);

  const generalTemplates = templates.filter((t) => t.scope === "GENERAL");
  const phaseTemplatesList = templates.filter((t) => t.scope === "PHASE");

  return (
    <>
      <PageHeader
        eyebrow="StudioFlow"
        title="Requirement Templates"
        description="Studio-wide requirement templates seeded into new projects."
        divider
        actions={
          canManage ? (
            <Link
              href="/studioflow/settings/requirements/new"
              className="inline-flex items-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-on-ink hover:bg-ink/90"
            >
              <Plus className="size-4" /> New Template
            </Link>
          ) : undefined
        }
      />

      <div className="space-y-6 px-6 py-4">
        <SectionCard
          id="general"
          title="General Requirements"
          count={generalTemplates.length}
          padded={false}
          className="scroll-mt-6"
        >
          <p className="border-b border-line-subtle px-3.5 py-2.5 text-sm text-ink-secondary">
            Project-scoped requirements applied to every new project.
          </p>
          {generalTemplates.length === 0 ? (
            <EmptyState
              icon={Settings}
              title="No general templates"
              description="Create general requirement templates to seed future projects."
            />
          ) : (
            <ol className="m-0 list-none p-0">
              {generalTemplates.map((template) => (
                <li
                  key={template.id}
                  className="flex items-center gap-3 border-b border-line-subtle px-3.5 py-2.5 last:border-0"
                >
                  <span className="font-ui-mono text-[0.6875rem] text-ink-tertiary tabular-nums">
                    {template.sort_order}
                  </span>
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

        <SectionCard
          id="phase"
          title="Phase Requirements"
          count={phaseTemplatesList.length}
          padded={false}
          className="scroll-mt-6"
        >
          <p className="border-b border-line-subtle px-3.5 py-2.5 text-sm text-ink-secondary">
            Requirements applied when a specific phase is added to a project.
          </p>
          {phaseTemplatesList.length === 0 ? (
            <EmptyState
              icon={Settings}
              title="No phase templates"
              description="Create phase requirement templates to seed project phases."
            />
          ) : (
            <ol className="m-0 list-none p-0">
              {phaseTemplatesList.map((template) => {
                const pt = phaseTemplates.find((p) => p.id === template.phase_template_id);
                return (
                  <li
                    key={template.id}
                    className="flex items-center gap-3 border-b border-line-subtle px-3.5 py-2.5 last:border-0"
                  >
                    <span className="font-ui-mono text-[0.6875rem] text-ink-tertiary tabular-nums">
                      {template.sort_order}
                    </span>
                    <div className="grid min-w-0 flex-1 gap-px">
                      <span className="truncate text-sm font-semibold">{template.title}</span>
                      <span className="font-ui-mono text-[0.6875rem] text-ink-tertiary">
                        {template.key}
                        {pt ? ` \u2014 ${pt.name}` : ""}
                      </span>
                    </div>
                    {pt ? (
                      <Link href={`/studioflow/settings/phases/${pt.id}/requirements`} className="text-xs font-medium text-ink-secondary hover:text-ink">
                        Open phase requirements
                      </Link>
                    ) : null}
                    {canManage && !template.deleted_at ? <EditRequirementTemplateForm template={template} /> : null}
                    {template.deleted_at ? <Badge tone="warning">Archived</Badge> : null}
                    {template.key_immutable ? <Badge>In use</Badge> : null}
                    {canManage ? <RequirementTemplateActions templateId={template.id} archived={Boolean(template.deleted_at)} canDelete={!template.key_immutable} /> : null}
                  </li>
                );
              })}
            </ol>
          )}
        </SectionCard>
      </div>
    </>
  );
}
