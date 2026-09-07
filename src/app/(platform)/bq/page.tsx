import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, Plus } from "lucide-react";

import { BQ_PERMISSIONS } from "@/apps/bq/service";
import { bqPublicRead, bqService } from "@/apps/bq/runtime";
import { prisma } from "@/platform/core/db";
import { requirePrincipalGrants } from "@platform/core/auth";
import { hasAnyPermission, hasPermission } from "@platform/core/rbac";
import { readPlatformGeneralSettings } from "@platform/core/settings";
import { DataTable, DirectoryShell, EmptyState, EntityPrimaryCell, ErrorState, PageHeader, SectionCard, TableBody, TableCell, TableHead, TableHeader, TableRow, buttonClasses } from "@/platform/ui_engine";
import { createMoney, formatMoney } from "@platform/utilities/money";
import { ProjectDeletionReview } from "./project-deletion-review";

export const dynamic = "force-dynamic";

export default async function BqProjectsPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;
  const canRead = hasAnyPermission(grants, [BQ_PERMISSIONS.projectRead, BQ_PERMISSIONS.projectManage]);
  const canManage = hasPermission(grants, BQ_PERMISSIONS.projectManage);
  const canApproveDeletion = hasPermission(grants, BQ_PERMISSIONS.projectDeleteApprove);
  if (!canRead && !canApproveDeletion) return <div className="grid gap-4"><PageHeader eyebrow="Bill of Quantity" title="Projects" /><SectionCard><ErrorState title="Access denied" description="You do not have permission to view BQ projects or deletion reviews." /></SectionCard></div>;
  const settings = await readPlatformGeneralSettings(prisma);
  const [projects, deletionRequests] = await Promise.all([canRead ? bqPublicRead.listProjectSummaries() : [], canApproveDeletion ? bqService.listProjectDeletionRequests({ grants }) : []]);
  return <div className="flex min-h-0 flex-1 flex-col gap-6 p-(--ui-page-padding)">
    <PageHeader eyebrow="Bill of Quantity" title="Projects" description="Manage your BQ projects" actions={canManage ? <Link href="/bq/new" className={buttonClasses("primary", "md")}><Plus size={16} aria-hidden="true" /> New project</Link> : null} />
    {canRead ? (projects.length === 0 ? <SectionCard><EmptyState icon={FileText} title="No projects yet" description="Create your first BQ project." /></SectionCard> : <DirectoryShell surface fill><DataTable framed={false} density="compact" stickyHeader fill minWidth={640}>
      <TableHeader><TableRow><TableHead>Project</TableHead><TableHead>Client</TableHead><TableHead>Estimator</TableHead><TableHead align="end">Grand Total</TableHead><TableHead>Created</TableHead></TableRow></TableHeader>
      <TableBody>{projects.map((project) => <TableRow key={project.id}><TableCell><EntityPrimaryCell tone={project.status === "ACTIVE" ? "success" : project.status === "ARCHIVED" ? "danger" : "warning"} statusLabel={project.status} name={<Link href={`/bq/${project.id}`} className="font-medium text-action hover:underline">{project.title}</Link>} secondary={`Updated ${new Intl.DateTimeFormat(settings.locale, { timeZone: settings.timezone, dateStyle: "medium" }).format(new Date(project.updatedAt))}`} /></TableCell><TableCell>{project.clientName}</TableCell><TableCell>{project.createdBy}</TableCell><TableCell align="end">{project.grandTotal === null ? "—" : formatMoney(createMoney(project.grandTotal, "IDR"), { locale: settings.locale })}</TableCell><TableCell>{new Intl.DateTimeFormat(settings.locale, { timeZone: settings.timezone, dateStyle: "medium" }).format(new Date(project.createdAt))}</TableCell></TableRow>)}</TableBody>
    </DataTable></DirectoryShell>) : null}
    {canApproveDeletion ? <section className="grid min-h-0 gap-3"><h2 className="text-lg font-semibold">Pending deletion review</h2><ProjectDeletionReview requests={deletionRequests.map((row) => ({ id: row.id, projectTitle: row.project_title, requesterLabel: row.requester_label, requestedAt: row.requested_at.toISOString() }))} /></section> : null}
  </div>;
}
