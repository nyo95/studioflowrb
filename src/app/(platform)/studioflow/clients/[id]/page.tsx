import { redirect, notFound } from "next/navigation";
import { Users } from "lucide-react";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import {
  Breadcrumb,
  EmptyState,
  MetaList,
  PageHeader,
  SectionCard,
} from "@/platform/ui_engine";
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
      <>
        <PageHeader eyebrow="StudioFlow · Client" title="Client detail" divider />
        <SectionCard>
          <EmptyState icon={Users} title="Access denied" description="You do not have permission to view this client." />
        </SectionCard>
      </>
    );
  }

  const client = await studioFlowService.getClient(grants, id).catch((e: { kind?: string }) => {
    if (e?.kind === "NOT_FOUND") return null;
    throw e;
  });
  if (!client) notFound();

  const canManage = hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectManage);

  return (
    <>
      <Breadcrumb
        entries={[
          { label: "Clients", href: "/studioflow/clients" },
          { label: client.name },
        ]}
      />
      <PageHeader
        title={client.name}
        divider
        meta={
          <MetaList
            items={[
              client.contact_name,
              client.contact_phone,
              `${client._count.projects} project aktif`,
            ]}
          />
        }
      />
      <ClientDetailView
        client={client}
        canManage={canManage}
        liveProjectCount={client._count.projects}
      />
    </>
  );
}
