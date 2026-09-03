import Link from "next/link";
import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasAnyPermission, hasPermission } from "@platform/core/rbac";
import { BQ_PERMISSIONS } from "@/apps/bq/service";
import { bqPublicRead } from "@/apps/bq/runtime";
import { Button, Field, FormActions, Input, PageHeader, Select, SectionCard, Textarea } from "@/platform/ui_engine";

import { createProjectAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewBqProjectPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  if (!hasPermission(principalGrants.grants, BQ_PERMISSIONS.projectManage)) redirect("/bq");

  const canReadLibrary = hasAnyPermission(principalGrants.grants, [
    BQ_PERMISSIONS.libraryRead,
    BQ_PERMISSIONS.libraryManage,
  ]);
  const templates = canReadLibrary ? await bqPublicRead.listTemplates() : [];

  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader eyebrow="Bill of Quantity" title="Buat Project" description="Mulai BQ baru; struktur Section/Subsection dapat ditambahkan setelah project dibuat." />
      <SectionCard>
        <form action={createProjectAction} className="grid gap-4">
          <Field label="Judul project" required><Input name="title" required maxLength={160} autoFocus /></Field>
          <Field label="Klien" required><Input name="clientName" required maxLength={160} /></Field>
          {templates.length > 0 ? (
            <Field label="Template" description="Opsional — memuat scaffold Section dan Subsection dari template.">
              <Select name="templateId" defaultValue="">
                <option value="">Tanpa template</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Referensi eksternal"><Input name="externalRef" maxLength={160} /></Field>
          <Field label="Catatan"><Textarea name="notes" maxLength={2000} /></Field>
          <FormActions><Link href="/bq" className="text-sm text-action hover:underline">Batal</Link><Button type="submit" variant="primary">Buat project</Button></FormActions>
        </form>
      </SectionCard>
    </div>
  );
}
