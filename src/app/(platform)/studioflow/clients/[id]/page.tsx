import { redirect, notFound } from "next/navigation";
import { Users } from "lucide-react";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { EmptyState, PageHeader, SectionCard } from "@/platform/ui_engine";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/service";
import { studioFlowService } from "@/apps/studioflow/runtime";
import { ClientDetailView } from "./client-detail-view";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;

  const canRead = hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectRead) ||
    hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectManage);
  if (!canRead) {
    return (
      <div className="grid gap-4">
        <PageHeader eyebrow="StudioFlow · Klien" title="Detail klien" />
        <SectionCard>
          <EmptyState icon={Users} title="Akses ditolak" description="Kamu tidak punya permission." />
        </SectionCard>
      </div>
    );
  }

  const client = await studioFlowService.getClient(grants, id).catch((e: { code?: string }) => {
    if ((e as { kind?: string })?.kind === "NOT_FOUND") return null;
    throw e;
  });
  if (!client) notFound();

  const canManage = hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectManage);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 p-(--ui-page-padding)">
      <PageHeader
        eyebrow="StudioFlow · Klien"
        title={client.name}
      />
      <ClientDetailView client={client} canManage={canManage} />
    </div>
  );
}
