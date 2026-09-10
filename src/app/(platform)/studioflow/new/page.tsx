import { redirect } from "next/navigation";
import { FolderOpen } from "lucide-react";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import {
  Breadcrumb,
  EmptyState,
  PageHeader,
  SectionCard,
} from "@/platform/ui_engine";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/service";
import { studioFlowService } from "@/apps/studioflow/runtime";
import { ProjectForm } from "./project-form";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;

  if (!hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectManage)) {
    return (
      <>
        <Breadcrumb
        entries={[
          { label: "Projects", href: "/studioflow/projects" },
          { label: "New project" },
        ]}
      />
      <PageHeader title="New project" description="Phase templates are copied when the project is created." divider />
        <SectionCard>
          <EmptyState icon={FolderOpen} title="Access denied" description="You do not have permission to create projects." />
        </SectionCard>
      </>
    );
  }

  const clients = await studioFlowService.listClients(grants);
  const liveClients = clients.filter((c) => !c.deleted_at);

  return (
    <>
      <PageHeader eyebrow="StudioFlow" title="New project" divider />
      <SectionCard>
        {liveClients.length === 0 ? (
          <p className="mb-4 text-sm text-ink-secondary">No existing clients yet. You can create the first client in this form.</p>
        ) : null}
        <ProjectForm clients={liveClients.map((c) => ({ id: c.id, name: c.name }))} />
      </SectionCard>
    </>
  );
}
