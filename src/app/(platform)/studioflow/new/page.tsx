import { redirect } from "next/navigation";
import { FolderOpen } from "lucide-react";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { EmptyState, PageHeader, SectionCard } from "@/platform/ui_engine";
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
      <div className="grid gap-4">
        <PageHeader eyebrow="StudioFlow" title="Project baru" />
        <SectionCard>
          <EmptyState icon={FolderOpen} title="Akses ditolak" description="Kamu tidak punya permission untuk membuat project." />
        </SectionCard>
      </div>
    );
  }

  const clients = await studioFlowService.listClients(grants);
  const liveClients = clients.filter((c) => !c.deleted_at);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 p-(--ui-page-padding)">
      <PageHeader eyebrow="StudioFlow" title="Project baru" />
      {liveClients.length === 0 ? (
        <SectionCard>
          <EmptyState
            icon={FolderOpen}
            title="Belum ada klien"
            description="Tambahkan klien terlebih dahulu sebelum membuat project."
          />
        </SectionCard>
      ) : (
        <SectionCard>
          <ProjectForm clients={liveClients.map((c) => ({ id: c.id, name: c.name }))} />
        </SectionCard>
      )}
    </div>
  );
}
