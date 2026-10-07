import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { ErrorState, PageHeader, SectionCard } from "@/platform/ui_engine";

import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/public";
import { masterDataService } from "@/apps/masterdata/runtime";
import { sampleRequestCoordinator } from "@/app/sample-request-runtime";

import { SampleRequestDirectory } from "./sample-request-directory";

export const dynamic = "force-dynamic";

export default async function SampleRequestsPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;

  if (!hasPermission(grants, MASTERDATA_PERMISSIONS.sampleRequestManage)) {
    return (
      <>
        <PageHeader title="Sample requests" divider />
        <SectionCard>
          <ErrorState title="Access denied" description="You do not have permission to view sample requests." />
        </SectionCard>
      </>
    );
  }

  const canManageVendors = hasPermission(grants, MASTERDATA_PERMISSIONS.vendorManage);
  // Putting a request on the shelf needs the shelf permission as well (WO-MD-SAMPLE-01 decision 9).
  const canShelve = hasPermission(grants, MASTERDATA_PERMISSIONS.sampleManage);
  const [queue, vendors, vendorTypes, skus, racks] = await Promise.all([
    sampleRequestCoordinator.listQueue({ grants, includeFinished: true }),
    masterDataService.listSampleRequestVendorChoices({ grants }),
    canManageVendors ? masterDataService.listVendorTypesForAssignment({ grants }) : [],
    masterDataService.listSampleRequestSkuChoices({ grants }),
    canShelve && hasPermission(grants, MASTERDATA_PERMISSIONS.sampleRead) ? masterDataService.listSampleRacks({ grants }) : [],
  ]);

  return (
    <>
      <PageHeader title="Sample requests" divider />
      <SampleRequestDirectory
        rows={queue}
        vendors={vendors}
        skus={skus}
        canPrice={hasPermission(grants, MASTERDATA_PERMISSIONS.priceMaterialManage)}
        canManageVendors={canManageVendors}
        canShelve={canShelve}
        racks={racks}
        vendorTypes={vendorTypes.filter((type) => type.can_supply_material).map((type) => ({ id: type.id, name: type.name }))}
      />
    </>
  );
}
