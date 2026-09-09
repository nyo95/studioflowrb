import { redirect } from "next/navigation";
import { Users } from "lucide-react";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import {
  Breadcrumb,
  EmptyState,
  PageHeader,
  SectionCard,
} from "@/platform/ui_engine";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/service";
import { ClientForm } from "./client-form";

export const dynamic = "force-dynamic";

export default async function NewClientPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;

  if (!hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectManage)) {
    return (
      <>
        <Breadcrumb
        entries={[
          { label: "Klien", href: "/studioflow/clients" },
          { label: "Klien baru" },
        ]}
      />
      <PageHeader title="Klien baru" description="Klien harus ada sebelum project bisa dibuka." divider />
        <SectionCard>
          <EmptyState icon={Users} title="Akses ditolak" description="Kamu tidak punya permission untuk menambahkan klien." />
        </SectionCard>
      </>
    );
  }

  return (
    <>
      <PageHeader eyebrow="StudioFlow · Klien" title="Klien baru" divider />
      <SectionCard>
        <ClientForm />
      </SectionCard>
    </>
  );
}
