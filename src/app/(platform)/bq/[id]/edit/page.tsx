import { notFound, redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { BQ_PERMISSIONS } from "@/apps/bq/service";
import { bqPublicRead } from "@/apps/bq/runtime";
import { PageHeader, SectionCard } from "@/platform/ui_engine";
import { ProjectForm } from "../../project-form";

export const dynamic = "force-dynamic";

export default async function EditBqProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  if (!hasPermission(principalGrants.grants, BQ_PERMISSIONS.projectManage)) redirect(`/bq/${id}`);
  const project = await bqPublicRead.getProjectDetail(id);
  if (!project) notFound();
  if (project.status === "LOCKED" || project.status === "ARCHIVED") redirect(`/bq/${id}`);

  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader eyebrow="Bill of Quantity" title="Edit Project" />
      <SectionCard>
        <ProjectForm project={project} />
      </SectionCard>
    </div>
  );
}
