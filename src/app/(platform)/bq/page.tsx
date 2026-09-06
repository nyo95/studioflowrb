import { prisma } from "@/platform/core/db";
import { readPlatformGeneralSettings } from "@platform/core/settings";

import { redirect } from "next/navigation";

import Link from "next/link";



import { requirePrincipalGrants } from "@platform/core/auth";

import { hasAnyPermission,hasPermission } from "@platform/core/rbac";

import { DataTable,EmptyState,ErrorState,PageHeader,SectionCard,StatusBadge,TableBody,TableCell,TableHead,TableHeader,TableRow,buttonClasses } from "@/platform/ui_engine";

import { BQ_PERMISSIONS } from "@/apps/bq/service";

import { bqPublicRead } from "@/apps/bq/runtime";

import { FileText,Plus } from "lucide-react";

import { createMoney,formatMoney } from "@platform/utilities/money";



export const dynamic = "force-dynamic";



export default async function BqProjectsPage() {

  const principalGrants = await requirePrincipalGrants().catch(() => null);

  if (!principalGrants) redirect("/login");

  const { grants } = principalGrants;
  const settings = await readPlatformGeneralSettings(prisma);



  const canRead = hasAnyPermission(grants, [BQ_PERMISSIONS.projectRead, BQ_PERMISSIONS.projectManage]);

  const canManage = hasPermission(grants, BQ_PERMISSIONS.projectManage);



  if (!canRead) {

    return (

      <div className="grid gap-4">

        <PageHeader eyebrow="Bill of Quantity" title="Projects" />

        <SectionCard>

          <ErrorState

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

              <Plus size={16} aria-hidden="true" /> New project

            </Link>

          ) : null

        }

      />



      {projects.length === 0 ? (

        <SectionCard>

          <EmptyState

            icon={FileText}

            title="No projects yet"

            description="Create your first BQ project."



          />

        </SectionCard>

      ) : (

        <DataTable density="compact" stickyHeader maxBodyHeight="60vh" minWidth={700}>

            <TableHeader>

              <TableRow>

                <TableHead>Title</TableHead>

                <TableHead>Client</TableHead>

                <TableHead>Status</TableHead>

                <TableHead>Estimator</TableHead>

                <TableHead align="end">Grand Total</TableHead>

                <TableHead>Created</TableHead>

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

                  <TableCell align="end">

                    {p.grandTotal === null ? "—" : formatMoney(createMoney(p.grandTotal, "IDR"), { locale: settings.locale })}

                  </TableCell>

                  <TableCell>

                    {new Intl.DateTimeFormat(settings.locale, { timeZone: settings.timezone, dateStyle: "medium" }).format(new Date(p.createdAt))}

                  </TableCell>

                </TableRow>

              ))}

            </TableBody>

          </DataTable>

      )}

    </div>

  );

}
