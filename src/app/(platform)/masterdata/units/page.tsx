import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { ErrorState, PageHeader, SectionCard } from "@/platform/ui_engine";
import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/service";
import { masterDataService } from "@/apps/masterdata/runtime";

import { UnitDirectory } from "./unit-directory";

export const dynamic = "force-dynamic";

export default async function UnitsPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;

  if (!hasPermission(grants, MASTERDATA_PERMISSIONS.dictionaryRead)) {
    return (
      <div className="grid gap-4">
        <PageHeader eyebrow="Master Data" title="Measurement Units" />
        <SectionCard>
          <ErrorState title="Access denied" description="You do not have permission to view units." />
        </SectionCard>
      </div>
    );
  }

  const units = await masterDataService.listUnits({ grants, includeArchived: true });
  const canManage = hasPermission(grants, MASTERDATA_PERMISSIONS.dictionaryManage);

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Master Data"
        title="Measurement Units"
        description="Standardized unit codes (e.g. PCS, M2, KG, ROLL) used in SKU catalog, bills of materials, and pricing."
      />
      <UnitDirectory units={units} canManage={canManage} />
    </div>
  );
}
