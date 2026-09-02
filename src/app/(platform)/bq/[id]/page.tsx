import { redirect } from "next/navigation";
import Link from "next/link";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission, hasAnyPermission } from "@platform/core/rbac";
import {
  PageHeader,
  SectionCard,
  DataTable,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  TableHead,
  EmptyState,
  buttonClasses,
} from "@/platform/ui_engine";
import { BQ_PERMISSIONS } from "@/apps/bq/service";
import { bqPublicRead } from "@/apps/bq/runtime";
import { notFound } from "next/navigation";
import { AddSectionDialog } from "./add-section-dialog";

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
          canManage && !isLocked && project.sections.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <Link href={`/bq/${project.id}/edit`} className={buttonClasses("secondary", "md")}>
                Edit
              </Link>
              <AddSectionDialog projectId={project.id} />
            </div>
          ) : null
        }
      />

      {project.sections.length === 0 ? (
        <SectionCard>
          <EmptyState
            title="Belum ada section"
            description={
              canManage
                ? "Tambahkan section secara manual atau scaffold dari template."
                : "Project ini belum memiliki section."
            }
            action={canManage && !isLocked ? <AddSectionDialog projectId={project.id} /> : undefined}
          />
        </SectionCard>
      ) : (
        <SectionCard>
          <DataTable>
            <TableHeader>
              <TableRow>
                <TableHead>Section / Subsection</TableHead>
                <TableHead align="end">Items</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {project.sections.map((section) => {
                const subItems = section.subsections.flatMap((sub) =>
                  sub.items.map((item) => ({ subsection: sub.name, ...item }))
                );
                return (
                  <TableRow key={section.id}>
                    <TableCell className="font-medium" rowSpan={Math.max(subItems.length, 1)}>
                      {section.name}
                    </TableCell>
                    {subItems.length === 0 ? (
                      <TableCell align="end">0</TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </DataTable>
        </SectionCard>
      )}
    </div>
  );
}
