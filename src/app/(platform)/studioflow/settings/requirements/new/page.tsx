import { redirect } from "next/navigation";
import { Breadcrumb, EmptyState, PageHeader, SectionCard } from "@/platform/ui_engine";
import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/service";
import { studioFlowService } from "@/apps/studioflow/runtime";
import { RequirementTemplateForm } from "../template-form";

export const dynamic = "force-dynamic";

export default async function NewRequirementTemplatePage({ searchParams }: { searchParams: Promise<{ phase_template_id?: string }> }) {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;
  if (!hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectManage)) {
    return <SectionCard><EmptyState title="Access denied" description="You do not have permission to create requirement templates." /></SectionCard>;
  }
  const phaseTemplates = await studioFlowService.listPhaseTemplates(grants);
  const phaseTemplateId = (await searchParams).phase_template_id;
  if (phaseTemplateId && !phaseTemplates.some((phase) => phase.id === phaseTemplateId)) {
    redirect("/studioflow/settings/requirements");
  }
  return (
    <>
      <Breadcrumb entries={[{ label: "Requirement templates", href: "/studioflow/settings/requirements" }, { label: "New template" }]} />
      <PageHeader eyebrow="StudioFlow · Requirements" title={phaseTemplateId ? "New phase requirement template" : "New requirement template"} description="Seed a General or Phase requirement into future projects." divider />
      <SectionCard><RequirementTemplateForm phaseTemplates={phaseTemplates} fixedPhaseTemplateId={phaseTemplateId} /></SectionCard>
    </>
  );
}
