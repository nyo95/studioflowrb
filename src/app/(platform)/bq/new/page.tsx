import Link from "next/link";
import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { BQ_PERMISSIONS } from "@/apps/bq/service";
import { Button, Field, FormActions, Input, PageHeader, SectionCard } from "@/platform/ui_engine";

import { createProjectAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewBqProjectPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  if (!hasPermission(principalGrants.grants, BQ_PERMISSIONS.projectManage)) redirect("/bq");

  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader eyebrow="Bill of Quantity" title="Buat Project" description="Mulai BQ baru; struktur Section/Subsection dapat ditambahkan setelah project dibuat." />
      <SectionCard>
        <form action={createProjectAction} className="grid gap-4">
          <Field label="Judul project" required><Input name="title" required maxLength={160} autoFocus /></Field>
          <Field label="Klien" required><Input name="clientName" required maxLength={160} /></Field>
          <Field label="Referensi eksternal"><Input name="externalRef" maxLength={160} /></Field>
          <Field label="Catatan"><textarea name="notes" maxLength={2000} className="min-h-24 rounded-control border border-line bg-surface px-3 py-2 text-sm" /></Field>
          <FormActions><Link href="/bq" className="text-sm text-action hover:underline">Batal</Link><Button type="submit" variant="primary">Buat project</Button></FormActions>
        </form>
      </SectionCard>
    </div>
  );
}
