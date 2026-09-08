import { Users } from "lucide-react";
import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { EmptyState, PageHeader, SectionCard } from "@/platform/ui_engine";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/service";

export const dynamic = "force-dynamic";

export default async function StudioFlowClientsPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;
  const canManage = hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectManage);

  if (!canManage) {
    return (
      <div className="grid gap-4">
        <PageHeader eyebrow="StudioFlow" title="Clients" />
        <SectionCard>
          <EmptyState
            icon={Users}
            title="Akses ditolak"
            description="Kamu tidak punya permission untuk mengelola client."
          />
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 p-(--ui-page-padding)">
      <PageHeader
        eyebrow="StudioFlow"
        title="Clients"
        description="Daftar client studio"
      />
      <SectionCard>
        <EmptyState
          icon={Users}
          title="Belum ada client"
          description="Tambah client pertama untuk memulai project."
        />
      </SectionCard>
    </div>
  );
}
