import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasAnyPermission, hasPermission } from "@platform/core/rbac";
import { BQ_PERMISSIONS } from "@/apps/bq/service";
import { bqPublicRead } from "@/apps/bq/runtime";
import { PageHeader, SectionCard } from "@/platform/ui_engine";
import { ProjectForm } from "../project-form";

export const dynamic = "force-dynamic";

export default async function NewBqProjectPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  if (!hasPermission(principalGrants.grants, BQ_PERMISSIONS.projectManage)) redirect("/bq");

  const canReadLibrary = hasAnyPermission(principalGrants.grants, [
    BQ_PERMISSIONS.libraryRead,
    BQ_PERMISSIONS.libraryManage,
  ]);
  const templates = canReadLibrary ? await bqPublicRead.listTemplates() : [];

  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader eyebrow="Bill of Quantity" title="Buat Project" description="Mulai BQ baru; struktur Section/Subsection dapat ditambahkan setelah project dibuat." divider />
      <SectionCard>
        <ProjectForm templates={templates} />
      </SectionCard>
    </div>
  );
}
