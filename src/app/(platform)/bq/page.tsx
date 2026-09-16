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
  PageHeader,
  Pagination,
  SectionCard,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  FormattedInstant,
} from "@/platform/ui_engine";
import { createMoney, formatMoney } from "@platform/utilities/money";
import { ProjectDeletionReview } from "./project-deletion-review";
import { NewProjectButton } from "./new-project-dialog";

export const dynamic = "force-dynamic";

/** Rows per page, matching the other dense directories. */
const PAGE_SIZE = 25;

type View = "active" | "archived" | "deletion";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

/** Keep the tab in every pagination link so a page change stays on it. */
function listHref(view: View, page: number): string {
  const params = new URLSearchParams();
  if (view !== "active") params.set("view", view);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/bq?${query}` : "/bq";
}

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
  const params = await searchParams;
  const parsedPage = Number.parseInt(firstParam(params.page), 10);
  const requestedPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const requestedView = firstParam(params.view);
  const settings = await readPlatformGeneralSettings(prisma);
  const canReadLibrary = hasAnyPermission(grants, [BQ_PERMISSIONS.libraryRead, BQ_PERMISSIONS.libraryManage]);
  const [projects, deletionRequests, templates] = await Promise.all([canRead ? bqPublicRead.listProjectSummaries() : [], canApproveDeletion ? bqService.listProjectDeletionRequests({ grants }) : [], canManage && canReadLibrary ? bqPublicRead.listTemplates() : Promise.resolve([])]);

  // Locked projects are still working projects; only archived ones move out.
  const active = projects.filter((project) => project.status !== "ARCHIVED");
  const archived = projects.filter((project) => project.status === "ARCHIVED");
  const pendingDeletion = new Set(deletionRequests.map((row) => row.project_id));
  const views: View[] = [...(canRead ? (["active", "archived"] as const) : []), ...(canApproveDeletion ? (["deletion"] as const) : [])];
  const view: View = views.includes(requestedView as View) ? (requestedView as View) : views[0];

  const directory = (rows: typeof projects, tab: View, empty: { title: string; description: string }) => {
    if (rows.length === 0) return <SectionCard><EmptyState icon={FileText} title={empty.title} description={empty.description} /></SectionCard>;
    const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const page = tab === view ? Math.min(requestedPage, pageCount) : 1;
    const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    return <DirectoryShell surface fill pagination={<Pagination page={page} pageCount={pageCount} total={rows.length} pageSize={PAGE_SIZE} getHref={(nextPage) => listHref(tab, nextPage)} label={tab === "archived" ? "Archived project pages" : "Project pages"} />}><DataTable framed={false} density="compact" stickyHeader fill minWidth={640}>
      <TableHeader><TableRow><TableHead>Project</TableHead><TableHead>Client</TableHead><TableHead>Estimator</TableHead><TableHead align="end">Grand Total</TableHead><TableHead>Created</TableHead></TableRow></TableHeader>
      <TableBody>{pageRows.map((project) => <TableRow key={project.id}><TableCell><EntityPrimaryCell tone={project.status === "ACTIVE" ? "success" : project.status === "ARCHIVED" ? "danger" : "warning"} statusLabel={project.status} name={<Link href={`/bq/${project.id}`} className="font-medium text-action hover:underline">{project.title}</Link>} secondary={<>{project.status === "LOCKED" ? "Locked · " : null}{pendingDeletion.has(project.id) ? "Deletion requested · " : null}Updated <FormattedInstant value={project.updatedAt} locale={settings.locale} timeZone={settings.timezone} /></>} /></TableCell><TableCell>{project.clientName}</TableCell><TableCell>{project.createdBy}</TableCell><TableCell align="end">{project.grandTotal === null ? "—" : formatMoney(createMoney(project.grandTotal, "IDR"), { locale: settings.locale })}</TableCell><TableCell><FormattedInstant value={project.createdAt} locale={settings.locale} timeZone={settings.timezone} /></TableCell></TableRow>)}</TableBody>
    </DataTable></DirectoryShell>;
  };

  const tabs = [
    ...(canRead ? [
      { value: "active", label: `Active · ${active.length}`, content: directory(active, "active", { title: "No projects yet", description: "Create your first BQ project." }) },
      { value: "archived", label: `Archived · ${archived.length}`, content: directory(archived, "archived", { title: "No archived projects", description: "Archived projects appear here and can be restored or submitted for deletion." }) },
    ] : []),
    ...(canApproveDeletion ? [
      { value: "deletion", label: `Deletion review · ${deletionRequests.length}`, content: <ProjectDeletionReview requests={deletionRequests.map((row) => ({ id: row.id, projectTitle: row.project_title, requesterLabel: row.requester_label, requestedAt: row.requested_at.toISOString() }))} /> },
    ] : []),
  ];

  return <>
    <PageHeader eyebrow="Bill of Quantity" title="Projects" description="Manage your BQ projects" actions={canManage ? <NewProjectButton templates={templates} /> : null} divider />
    <Tabs label="Project lists" items={tabs} defaultValue={view} fill />
  </>;
}
