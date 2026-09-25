import Link from "next/link";
import { notFound } from "next/navigation";

import { AppError } from "@platform/core/errors";
import { hasPermission } from "@platform/core/rbac";
import { STUDIOFLOW_PERMISSIONS as P, STUDIOFLOW_ROUTES } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { Badge, Breadcrumb, DescriptionItem, DescriptionList, EmptyState, PageHeader, PageShell, SectionCard, StatusBadge } from "@/platform/ui_engine";

import { PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE } from "../../_components/phase-status";
import { pageSession } from "../../_components/session";
import { ClientEditButton } from "./client-edit-button";

export const dynamic = "force-dynamic";

export default async function ClientPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { grants } = await pageSession();
  const client = await studioFlow.projects.getClient({ grants, clientId }).catch((error) => {
    if (error instanceof AppError && error.kind === "NOT_FOUND") notFound();
    throw error;
  });
  return (
    <PageShell measure="wide">
      <div className="grid gap-4">
      <Breadcrumb entries={[{ label: "Clients", href: STUDIOFLOW_ROUTES.clients }, { label: client.name }]} />
      <PageHeader title={client.name} meta={client.archived_at ? <Badge>Archived</Badge> : undefined} actions={hasPermission(grants, P.projectManage) ? <ClientEditButton client={{ id: client.id, name: client.name, address: client.address }} /> : undefined} divider />
      <SectionCard title="Details">
        <DescriptionList><DescriptionItem label="Address">{client.address ?? "—"}</DescriptionItem></DescriptionList>
      </SectionCard>
      <SectionCard title="Projects" count={client.projects.length} padded>
        {client.projects.length === 0 ? <EmptyState title="No projects for this client" /> : (
          <ul className="m-0 grid list-none gap-1 p-0">
            {client.projects.map((project) => (
              <li key={project.id} className="flex items-center justify-between gap-3 border-b border-line-subtle py-2 last:border-b-0">
                <Link href={STUDIOFLOW_ROUTES.project(project.id)} prefetch={false} className="hover:underline">{project.name}</Link>
                <span className="flex items-center gap-2">
                  {project.archived_at ? <Badge>Archived</Badge> : null}
                  <StatusBadge tone={PROJECT_STATUS_TONE[project.status as keyof typeof PROJECT_STATUS_TONE]}>{PROJECT_STATUS_LABEL[project.status as keyof typeof PROJECT_STATUS_LABEL]}</StatusBadge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      </div>
    </PageShell>
  );
}
