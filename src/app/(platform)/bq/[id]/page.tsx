import { redirect, notFound } from "next/navigation";
import Link from "next/link";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission, hasAnyPermission } from "@platform/core/rbac";
import { Breadcrumb, PageHeader, SectionCard, EmptyState, buttonClasses } from "@/platform/ui_engine";
import { BQ_PERMISSIONS } from "@/apps/bq/service";
import { bqPublicRead, masterDataRead } from "@/apps/bq/runtime";

import { ProjectEditor } from "./project-editor";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = { ACTIVE: "Aktif", LOCKED: "Terkunci", ARCHIVED: "Diarsipkan" };

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
  const canManageLibrary = hasPermission(grants, BQ_PERMISSIONS.libraryManage);

  if (!canRead) redirect("/bq");

  const [project, assemblies, units] = await Promise.all([bqPublicRead.getProjectDetail(id), bqPublicRead.listAssemblyTemplates(), masterDataRead.listUnits()]);
  if (!project) notFound();

  const isLocked = project.status === "LOCKED" || project.status === "ARCHIVED";

  return (
    <div className="grid gap-6">
      <PageHeader
        context={<Breadcrumb variant="capsule" appMark="BQ" entries={[{ label: "BQ", href: "/bq" }, { label: "Project", href: "/bq" }, { label: project.title }]} />}
        title={project.title}
        description={`Klien: ${project.clientName} · ${STATUS_LABEL[project.status] ?? project.status}`}
        actions={
          canManage && !isLocked ? (
            <Link href={`/bq/${project.id}/edit`} className={buttonClasses("secondary", "md")}>
              Ubah detail
            </Link>
          ) : null
        }
        divider
      />

      {project.sections.length === 0 && !canManage ? (
        <SectionCard>
          <EmptyState title="Belum ada Section" description="Project ini belum memiliki Section." />
        </SectionCard>
      ) : (
      <ProjectEditor key={`${project.updatedAt}:${project.sections.length}`} project={project} canManage={canManage} canManageLibrary={canManageLibrary} assemblies={assemblies} units={units} />
      )}
    </div>
  );
}
