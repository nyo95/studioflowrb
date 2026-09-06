import { redirect } from "next/navigation";


import { requirePrincipalGrants } from "@platform/core/auth";

import { hasPermission } from "@platform/core/rbac";

import { ErrorState,PageHeader,SectionCard } from "@/platform/ui_engine";

import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/service";

import { masterDataService } from "@/apps/masterdata/runtime";


import { CategoryDirectory } from "./category-directory";


export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;
  const canRead = hasPermission(grants, MASTERDATA_PERMISSIONS.dictionaryRead);
  const canManage = hasPermission(grants, MASTERDATA_PERMISSIONS.dictionaryManage);

  if (!canRead && !canManage) {
    return (
      <div className="grid gap-4">
        <PageHeader title="Categories" />
        <SectionCard>
          <ErrorState title="Access denied" description="You do not have permission to view categories." />
        </SectionCard>
      </div>
    );
  }

  const categories = await masterDataService.listCategories({ grants, includeDeactivated: true });
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Product &amp; Work Categories"
      />
      <CategoryDirectory categories={categories} canManage={canManage} />
    </div>
  );
}
