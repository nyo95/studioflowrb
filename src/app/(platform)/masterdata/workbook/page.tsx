import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { ErrorState, PageHeader, SectionCard } from "@/platform/ui_engine";

import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/service";

import { WorkbookImport } from "./workbook-import";

export const dynamic = "force-dynamic";

export default async function WorkbookPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;
  const canExport = hasPermission(grants, MASTERDATA_PERMISSIONS.skuRead) && hasPermission(grants, MASTERDATA_PERMISSIONS.priceMaterialRead);
  const canImport = hasPermission(grants, MASTERDATA_PERMISSIONS.skuManage) && hasPermission(grants, MASTERDATA_PERMISSIONS.priceMaterialManage);

  if (!canExport && !canImport) {
    return (
      <>
        <PageHeader title="Excel workbook" divider />
        <SectionCard>
          <ErrorState title="Access denied" description="You do not have permission to export or import the SKU price workbook." />
        </SectionCard>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Excel workbook" description="Edit SKUs and their material prices in Excel, then import them back. Nothing is saved until you confirm." divider />
      <WorkbookImport canExport={canExport} canImport={canImport} />
    </>
  );
}
