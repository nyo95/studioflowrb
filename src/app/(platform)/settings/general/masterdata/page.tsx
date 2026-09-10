import Link from "next/link";
import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { ErrorState, PageHeader, PageShell, SectionCard, Tabs } from "@/platform/ui_engine";
import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/service";
import { masterDataService } from "@/apps/masterdata/runtime";
import { promotionCoordinator } from "@/app/promotion-runtime";
import { UnitDirectory } from "@/app/(platform)/masterdata/units/unit-directory";
import { CategoryDirectory } from "@/app/(platform)/masterdata/categories/category-directory";
import { DeletionDirectory } from "@/app/(platform)/masterdata/deletions/deletion-directory";
import { VendorTypeDirectory } from "./vendor-type-directory";
import { PromotionReview } from "./promotion-review";

export const dynamic = "force-dynamic";

export default async function MasterDataSettingsPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;
  const canRead = hasPermission(grants, MASTERDATA_PERMISSIONS.dictionaryRead) || hasPermission(grants, MASTERDATA_PERMISSIONS.promotionApprove);
  const canManage = hasPermission(grants, MASTERDATA_PERMISSIONS.dictionaryManage);
  if (!canRead && !canManage) {
    return <PageShell><PageHeader eyebrow="Settings" title="Master Data Settings" divider /><SectionCard><ErrorState title="Access denied" description="You do not have permission to view Master Data settings." /></SectionCard></PageShell>;
  }
  const [units, categories, vendorTypes, deletions] = await Promise.all([
    canRead && hasPermission(grants, MASTERDATA_PERMISSIONS.dictionaryRead) ? masterDataService.listUnits({ grants, includeArchived: true }) : [],
    canRead && hasPermission(grants, MASTERDATA_PERMISSIONS.dictionaryRead) ? masterDataService.listCategories({ grants, includeDeactivated: true }) : [],
    canRead && hasPermission(grants, MASTERDATA_PERMISSIONS.dictionaryRead) ? masterDataService.listVendorTypes({ grants, includeArchived: true }) : [],
    hasPermission(grants, MASTERDATA_PERMISSIONS.deletionApprove) ? masterDataService.listDeletionRequests({ grants, status: "PENDING" }) : [],
  ]);
  const canApprove = hasPermission(grants, MASTERDATA_PERMISSIONS.deletionApprove);
  const canApprovePromotion = hasPermission(grants, MASTERDATA_PERMISSIONS.promotionApprove);
  const promotionRequests = canApprovePromotion ? await promotionCoordinator.listRequests({ grants }) : [];
  const promotionReferences = canApprovePromotion ? await promotionCoordinator.listReferences({ grants }) : [];
  return <PageShell size="wide"><PageHeader eyebrow="Settings" title="Master Data Settings" description="Controlled vocabularies, pricing approval, and protected deletion review." divider />
    <Tabs label="Master Data Settings" items={[
      { value: "units", label: "Units", content: <UnitDirectory units={units} canManage={canManage} /> },
      { value: "categories", label: "Categories", content: <CategoryDirectory categories={categories} canManage={canManage} /> },
      { value: "vendor-types", label: "Supplier types", content: <VendorTypeDirectory rows={vendorTypes} canManage={canManage} /> },
      { value: "deletions", label: "Deletion review", disabled: !canApprove, content: <DeletionDirectory pendingRequests={deletions} canApprove={canApprove} /> },
      { value: "promotions", label: "BQ approvals", disabled: !canApprovePromotion, content: <PromotionReview requests={promotionRequests} references={promotionReferences} /> },
    ]} />
    <p className="text-sm text-ink-secondary">Need catalog work? Return to <Link className="text-action underline" href="/masterdata">Master Data</Link>.</p>
  </PageShell>;
}
