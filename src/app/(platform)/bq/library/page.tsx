import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission, hasAnyPermission } from "@platform/core/rbac";
import { PageHeader, SectionCard, Tabs, DataTable, TableHeader, TableBody, TableRow, TableCell, TableHead, StatusBadge, EmptyState, Badge } from "@/platform/ui_engine";
import { BQ_PERMISSIONS } from "@/apps/bq/service";
import { bqPublicRead } from "@/apps/bq/runtime";
import { Library } from "lucide-react";
import { createMoney, formatMoney } from "@platform/utilities/money";
import { LibraryItemActions, LibraryItemCreateButton, TemplateActions, TemplateCreateButton } from "./library-controls";

export const dynamic = "force-dynamic";

export default async function BqLibraryPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;

  const canRead = hasAnyPermission(grants, [BQ_PERMISSIONS.libraryRead, BQ_PERMISSIONS.libraryManage]);
  const canManage = hasPermission(grants, BQ_PERMISSIONS.libraryManage);

  if (!canRead) {
    return (
      <div className="grid gap-4">
        <PageHeader eyebrow="Bill of Quantity" title="BQ Library" />
        <SectionCard>
          <EmptyState title="Access denied" description="You do not have permission to view the BQ Library." />
        </SectionCard>
      </div>
    );
  }

  const items = await bqPublicRead.listLibraryItems();
  const templates = await bqPublicRead.listTemplates();

  const kategoriLabel: Record<string, string> = {
    MATERIAL: "Material",
    UPAH: "Upah",
    MATERIAL_UPAH: "Material+Upah",
    BIAYA_UMUM: "Biaya Umum",
    TRANSPORTASI_AKOMODASI: "Transportasi",
    ALAT: "Alat",
  };

  const kategoriTone: Record<string, "neutral" | "success" | "warning" | "danger"> = {
    MATERIAL: "neutral",
    UPAH: "success",
    MATERIAL_UPAH: "warning",
    BIAYA_UMUM: "warning",
    TRANSPORTASI_AKOMODASI: "warning",
    ALAT: "neutral",
  };

  const statusTone: Record<string, "neutral" | "success" | "warning" | "danger"> = {
    DRAFT: "neutral",
    REQUESTED: "warning",
    APPROVED: "success",
    REJECTED: "danger",
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Bill of Quantity"
        title="BQ Library"
        description="Manage library items and templates"
        actions={canManage ? <div className="flex flex-wrap gap-2"><LibraryItemCreateButton /><TemplateCreateButton /></div> : null}
      />

      <Tabs
        label="BQ Library views"
        items={[
          {
            value: "items",
            label: "Items",
            content: (
              <SectionCard>
                {items.length === 0 ? (
                  <EmptyState
                    icon={Library}
                    title="Belum ada library items"
                    description="Mulai dengan menambahkan item baru."
                    action={canManage ? <LibraryItemCreateButton /> : undefined}
                  />
                ) : (
                  <DataTable>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nama</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead align="end">Harga</TableHead>
                        <TableHead>KATEGORI</TableHead>
                        <TableHead>Status</TableHead>
                        {canManage ? <TableHead align="end">Actions</TableHead> : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell>{item.purchaseUnit}</TableCell>
                          <TableCell align="end" className="tabular-nums">
                            {formatMoney(createMoney(item.harga, item.currency))}
                          </TableCell>
                          <TableCell>
                            <Badge tone={kategoriTone[item.kategori] ?? "neutral"}>
                              {kategoriLabel[item.kategori] ?? item.kategori}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <StatusBadge tone={statusTone[item.promotionStatus] ?? "neutral"}>
                              {item.promotionStatus}
                            </StatusBadge>
                          </TableCell>
                          {canManage ? <TableCell align="end"><LibraryItemActions item={item} /></TableCell> : null}
                        </TableRow>
                      ))}
                    </TableBody>
                  </DataTable>
                )}
              </SectionCard>
            ),
          },
          {
            value: "templates",
            label: "Templates",
            content: (
              <SectionCard>
                {templates.length === 0 ? (
                  <EmptyState
                    title="Belum ada template"
                    description="Buat template untuk scaffold project baru."
                    action={canManage ? <TemplateCreateButton /> : undefined}
                  />
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {templates.map((t) => {
                      const sectionCount = t.sections.filter((s) => !s.parentId).length;
                      const subCount = t.sections.filter((s) => s.parentId).length;
                      return (
                        <div
                          key={t.id}
                          className="rounded-lg border border-line p-4 hover:border-line-strong transition-colors"
                        >
                          <h3 className="font-semibold text-sm mb-1">{t.name}</h3>
                          <p className="text-xs text-ink-secondary mb-3">
                            {sectionCount} sections · {subCount} subsections
                          </p>
                          {canManage ? <TemplateActions template={t} /> : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </SectionCard>
            ),
          },
        ]}
      />
    </div>
  );
}
