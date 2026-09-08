import { FolderOpen } from "lucide-react";
import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { EmptyState, PageHeader, SectionCard } from "@/platform/ui_engine";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/service";

export const dynamic = "force-dynamic";

export default async function StudioFlowProjectsPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;
  const canRead = hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectRead);
  const canManage = hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectManage);

  if (!canRead && !canManage) {
    return (
      <div className="grid gap-4">
        <PageHeader eyebrow="StudioFlow" title="Projects" />
        <SectionCard>
          <EmptyState
            icon={FolderOpen}
            title="Akses ditolak"
            description="Kamu tidak punya permission untuk melihat project."
          />
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 p-(--ui-page-padding)">
      <PageHeader
        eyebrow="StudioFlow"
        title="Projects"
        description="Project desain aktif studio"
      />
      <SectionCard>
        <EmptyState
          icon={FolderOpen}
          title="Belum ada project"
          description="Buat project pertama studio."
        />
      </SectionCard>
    </div>
  );
}
