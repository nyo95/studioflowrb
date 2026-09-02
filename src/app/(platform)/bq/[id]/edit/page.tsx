import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { BQ_PERMISSIONS } from "@/apps/bq/service";
import { bqPublicRead } from "@/apps/bq/runtime";
import { Button, Field, FormActions, Input, PageHeader, SectionCard, Textarea } from "@/platform/ui_engine";

import { updateProjectAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditBqProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  if (!hasPermission(principalGrants.grants, BQ_PERMISSIONS.projectManage)) redirect(`/bq/${id}`);
  const project = await bqPublicRead.getProjectDetail(id);
  if (!project) notFound();
  if (project.status === "LOCKED") redirect(`/bq/${id}`);

  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader eyebrow="Bill of Quantity" title="Edit Project" />
      <SectionCard>
        <form action={updateProjectAction} className="grid gap-4">
          <input type="hidden" name="id" value={project.id} />
          <Field label="Judul project" required><Input name="title" required maxLength={160} defaultValue={project.title} autoFocus /></Field>
          <Field label="Klien" required><Input name="clientName" required maxLength={160} defaultValue={project.clientName} /></Field>
          <Field label="Referensi eksternal"><Input name="externalRef" maxLength={160} defaultValue={project.externalRef ?? ""} /></Field>
          <Field label="Catatan"><Textarea name="notes" maxLength={2000} defaultValue={project.notes ?? ""} /></Field>
          <FormActions><Link href={`/bq/${project.id}`} className="text-sm text-action hover:underline">Batal</Link><Button type="submit" variant="primary">Simpan perubahan</Button></FormActions>
        </form>
      </SectionCard>
    </div>
  );
}
