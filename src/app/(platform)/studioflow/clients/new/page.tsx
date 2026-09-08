import { redirect } from "next/navigation";
import { Users } from "lucide-react";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { EmptyState, PageHeader, SectionCard } from "@/platform/ui_engine";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/service";
import { ClientForm } from "./client-form";

export const dynamic = "force-dynamic";

export default async function NewClientPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;

  if (!hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectManage)) {
    return (
      <div className="grid gap-4">
        <PageHeader eyebrow="StudioFlow · Klien" title="Klien baru" />
        <SectionCard>
          <EmptyState icon={Users} title="Akses ditolak" description="Kamu tidak punya permission untuk menambahkan klien." />
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 p-(--ui-page-padding)">
      <PageHeader eyebrow="StudioFlow · Klien" title="Klien baru" />
      <SectionCard>
        <ClientForm />
      </SectionCard>
    </div>
  );
}
