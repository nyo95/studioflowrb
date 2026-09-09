import { redirect } from "next/navigation";
import { Settings } from "lucide-react";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { EmptyState, PageHeader, SectionCard } from "@/platform/ui_engine";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/service";
import { studioFlowService } from "@/apps/studioflow/runtime";

import { NamingTemplateForm } from "./naming-template-form";

export const dynamic = "force-dynamic";

export default async function StudioFlowSettingsPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;

  const canRead = hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectRead);
  const canManage = hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectManage);

  if (!canRead) {
    return (
      <div className="grid gap-4">
        <PageHeader eyebrow="StudioFlow" title="Pengaturan" />
        <SectionCard>
          <EmptyState icon={Settings} title="Akses ditolak" description="Kamu tidak punya permission untuk melihat pengaturan." />
        </SectionCard>
      </div>
    );
  }

  const settings = await studioFlowService.getStudioSettings();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 p-(--ui-page-padding)">
      <PageHeader
        eyebrow="StudioFlow"
        title="Pengaturan studio"
        description="Berlaku untuk semua project."
      />

      <SectionCard title="Template nama file">
        <p className="mb-4 text-sm text-ink-tertiary">
          Nama standar yang dipakai setiap kali file dicatat. Token yang tidak dikenal
          ditolak saat simpan, bukan saat file masuk.
        </p>
        <NamingTemplateForm template={settings.naming_template} canManage={canManage} />
      </SectionCard>
    </div>
  );
}
