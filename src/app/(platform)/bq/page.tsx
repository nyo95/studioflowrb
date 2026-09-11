import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText } from "lucide-react";

import { BQ_PERMISSIONS } from "@/apps/bq/service";
import { bqPublicRead, bqService } from "@/apps/bq/runtime";
import { prisma } from "@/platform/core/db";
import { requirePrincipalGrants } from "@platform/core/auth";
import { hasAnyPermission, hasPermission } from "@platform/core/rbac";
import { readPlatformGeneralSettings } from "@platform/core/settings";
import {
  DataTable,
  DirectoryShell,
  EmptyState,
  EntityPrimaryCell,
  ErrorState,
  Heading,
  PageHeader,
  Pagination,
  SectionCard,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  FormattedInstant,
} from "@/platform/ui_engine";
import { createMoney, formatMoney } from "@platform/utilities/money";
import { ProjectDeletionReview } from "./project-deletion-review";
import { NewProjectButton } from "./new-project-dialog";

export const dynamic = "force-dynamic";

/** Rows per page, matching the other dense directories. */
const PAGE_SIZE = 25;

export default async function BqProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;
  const canRead = hasAnyPermission(grants, [BQ_PERMISSIONS.projectRead, BQ_PERMISSIONS.projectManage]);
  const canManage = hasPermission(grants, BQ_PERMISSIONS.projectManage);
  const canApproveDeletion = hasPermission(grants, BQ_PERMISSIONS.projectDeleteApprove);
  if (!canRead && !canApproveDeletion) return <><PageHeader eyebrow="Bill of Quantity" title="Projects" divider /><SectionCard><ErrorState title="Access denied" description="You do not have permission to view BQ projects or deletion reviews." /></SectionCard></>;
  const rawPage = (await searchParams).page;
  const parsedPage = Number.parseInt(Array.isArray(rawPage) ? (rawPage[0] ?? "") : (rawPage ?? ""), 10);
  const requestedPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const settings = await readPlatformGeneralSettings(prisma);
  const canReadLibrary = hasAnyPermission(grants, [BQ_PERMISSIONS.libraryRead, BQ_PERMISSIONS.libraryManage]);
  const [projects, deletionRequests, templates] = await Promise.all([canRead ? bqPublicRead.listProjectSummaries() : [], canApproveDeletion ? bqService.listProjectDeletionRequests({ grants }) : [], canManage && canReadLibrary ? bqPublicRead.listTemplates() : Promise.resolve([])]);
  const pageCount = Math.max(1, Math.ceil(projects.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const pageProjects = projects.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return <>
    <PageHeader eyebrow="Bill of Quantity" title="Projects" description="Manage your BQ projects" actions={canManage ? <NewProjectButton templates={templates} /> : null} divider />
    {canRead ? (projects.length === 0 ? <SectionCard><EmptyState icon={FileText} title="No projects yet" description="Create your first BQ project." /></SectionCard> : <DirectoryShell surface fill pagination={<Pagination page={page} pageCount={pageCount} total={projects.length} pageSize={PAGE_SIZE} getHref={(nextPage) => (nextPage > 1 ? `/bq?page=${nextPage}` : "/bq")} label="Project pages" />}><DataTable framed={false} density="compact" stickyHeader fill minWidth={640}>
      <TableHeader><TableRow><TableHead>Project</TableHead><TableHead>Client</TableHead><TableHead>Estimator</TableHead><TableHead align="end">Grand Total</TableHead><TableHead>Created</TableHead></TableRow></TableHeader>
      <TableBody>{pageProjects.map((project) => <TableRow key={project.id}><TableCell><EntityPrimaryCell tone={project.status === "ACTIVE" ? "success" : project.status === "ARCHIVED" ? "danger" : "warning"} statusLabel={project.status} name={<Link href={`/bq/${project.id}`} className="font-medium text-action hover:underline">{project.title}</Link>} secondary={<>Updated <FormattedInstant value={project.updatedAt} locale={settings.locale} timeZone={settings.timezone} /></>} /></TableCell><TableCell>{project.clientName}</TableCell><TableCell>{project.createdBy}</TableCell><TableCell align="end">{project.grandTotal === null ? "—" : formatMoney(createMoney(project.grandTotal, "IDR"), { locale: settings.locale })}</TableCell><TableCell><FormattedInstant value={project.createdAt} locale={settings.locale} timeZone={settings.timezone} /></TableCell></TableRow>)}</TableBody>
    </DataTable></DirectoryShell>) : null}
    {canApproveDeletion ? <section className="grid min-h-0 gap-3"><Heading level={3}>Pending deletion review</Heading><ProjectDeletionReview requests={deletionRequests.map((row) => ({ id: row.id, projectTitle: row.project_title, requesterLabel: row.requester_label, requestedAt: row.requested_at.toISOString() }))} /></section> : null}
  </>;
}
