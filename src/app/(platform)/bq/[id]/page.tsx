import { redirect, notFound } from "next/navigation";
import Link from "next/link";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission, hasAnyPermission } from "@platform/core/rbac";
import { PageHeader, SectionCard, EmptyState, buttonClasses } from "@/platform/ui_engine";
import { BQ_PERMISSIONS } from "@/apps/bq/service";
import { bqPublicRead } from "@/apps/bq/runtime";

import { AddSectionDialog } from "./add-section-dialog";
import { ProjectEditor } from "./project-editor";

export const dynamic = "force-dynamic";

export default async function BqProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;

  const canRead = hasAnyPermission(grants, [BQ_PERMISSIONS.projectRead, BQ_PERMISSIONS.projectManage]);
  const canManage = hasPermission(grants, BQ_PERMISSIONS.projectManage);

  if (!canRead) redirect("/bq");

  const project = await bqPublicRead.getProjectDetail(id);
  if (!project) notFound();

  const isLocked = project.status === "LOCKED";

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Bill of Quantity"
        title={project.title}
        description={`Client: ${project.clientName} · ${project.status}`}
        actions={
          canManage && !isLocked ? (
            <div className="flex flex-wrap gap-2">
              <Link href={`/bq/${project.id}/edit`} className={buttonClasses("secondary", "md")}>
                Edit detail
              </Link>
              <AddSectionDialog projectId={project.id} />
            </div>
          ) : null
        }
      />

      {project.sections.length === 0 && !canManage ? (
        <SectionCard>
          <EmptyState title="Belum ada section" description="Project ini belum memiliki section." />
        </SectionCard>
      ) : (
        <ProjectEditor project={project} canManage={canManage} />
      )}
    </div>
  );
}
