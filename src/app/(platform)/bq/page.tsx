import { redirect } from "next/navigation";
import Link from "next/link";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission, hasAnyPermission } from "@platform/core/rbac";
import { PageHeader, SectionCard, DataTable, TableHeader, TableBody, TableRow, TableCell, TableHead, StatusBadge, EmptyState, buttonClasses } from "@/platform/ui_engine";
import { BQ_PERMISSIONS } from "@/apps/bq/service";
import { bqPublicRead } from "@/apps/bq/runtime";
import { FileText } from "lucide-react";
import { createMoney, formatMoney } from "@platform/utilities/money";

export const dynamic = "force-dynamic";

export default async function BqProjectsPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;

  const canRead = hasAnyPermission(grants, [BQ_PERMISSIONS.projectRead, BQ_PERMISSIONS.projectManage]);
  const canManage = hasPermission(grants, BQ_PERMISSIONS.projectManage);

  if (!canRead) {
    return (
      <div className="grid gap-4">
        <PageHeader eyebrow="Bill of Quantity" title="Projects" />
        <SectionCard>
          <EmptyState
            title="Access denied"
            description="You do not have permission to view BQ projects."
          />
        </SectionCard>
      </div>
    );
  }

  const projects = await bqPublicRead.listProjectSummaries();

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Bill of Quantity"
        title="Projects"
        description="Manage your BQ projects"
        actions={
          canManage ? (
            <Link href="/bq/new" className={buttonClasses("primary", "md")}>
              + Buat Project
            </Link>
          ) : null
        }
      />

      {projects.length === 0 ? (
        <SectionCard>
          <EmptyState
            icon={FileText}
            title="Belum ada BQ project"
            description="Mulai dengan membuat project baru."
            action={
              canManage ? (
                <Link href="/bq/new" className={buttonClasses("primary", "md")}>
                  + Buat Project Baru
                </Link>
              ) : null
            }
          />
        </SectionCard>
      ) : (
        <SectionCard>
          <DataTable>
            <TableHeader>
              <TableRow>
                <TableHead>Judul</TableHead>
                <TableHead>Klien</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Estimator</TableHead>
                <TableHead align="end">Grand Total</TableHead>
                <TableHead>Dibuat</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link href={`/bq/${p.id}`} className="text-action hover:underline font-medium">
                      {p.title}
                    </Link>
                  </TableCell>
                  <TableCell>{p.clientName}</TableCell>
                  <TableCell>
                    <StatusBadge
                      tone={p.status === "LOCKED" ? "success" : "neutral"}
                    >
                      {p.status}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>{p.createdBy}</TableCell>
                  <TableCell align="end" className="tabular-nums">
                    {p.grandTotal === null ? "—" : formatMoney(createMoney(p.grandTotal, "IDR"))}
                  </TableCell>
                  <TableCell>
                    {new Date(p.createdAt).toLocaleDateString("id-ID")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </DataTable>
        </SectionCard>
      )}
    </div>
  );
}
