import Link from "next/link";
import { redirect } from "next/navigation";

import { FileSpreadsheet } from "lucide-react";


import { requirePrincipalGrants } from "@platform/core/auth";

import { hasPermission } from "@platform/core/rbac";

import {
  ErrorState,
  PageHeader,
  SectionCard,
  buttonClasses,
} from "@/platform/ui_engine";

import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/service";

import { masterDataService } from "@/apps/masterdata/runtime";


import { SkuDirectory } from "./sku-directory";


export const dynamic = "force-dynamic";

export default async function SkusPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;
  const canRead = hasPermission(grants, MASTERDATA_PERMISSIONS.skuRead);
  const canManage = hasPermission(grants, MASTERDATA_PERMISSIONS.skuManage);

  if (!canRead && !canManage) {
    return (
      <>
        <PageHeader title="SKUs" divider />
        <SectionCard>
          <ErrorState title="Access denied" description="You do not have permission to view SKUs." />
        </SectionCard>
      </>
    );
  }

  const [skus, refs] = await Promise.all([
    masterDataService.listSkus({ grants, includeArchived: true }),
    masterDataService.listSkuDirectoryRefs({ grants }),
  ]);

  return (
    <>
      <PageHeader
        title="Material SKUs Catalog"
        actions={canManage ? (
          <Link href="/masterdata/workbook" className={buttonClasses("secondary")}>
            <FileSpreadsheet size={14} aria-hidden="true" />
            <span>Import & export</span>
          </Link>
        ) : undefined}
        divider
      />
      <SkuDirectory
        skus={skus.map((sku) => ({
          ...sku,
          dimension_length: sku.dimension_length?.toString() ?? null,
          dimension_width: sku.dimension_width?.toString() ?? null,
          dimension_thickness: sku.dimension_thickness?.toString() ?? null,
          purchase_to_base_factor: sku.purchase_to_base_factor?.toString() ?? null,
          material_prices: sku.material_prices.map((price) => ({
            ...price,
            amount: price.amount.toString(),
          })),
        }))}
        brands={refs.brands}
        units={refs.units}
        productCategories={refs.productCategories}
        canManage={canManage}
      />
    </>
  );
}
