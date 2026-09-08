"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button, Field, FormActions, InlineError, Input, SectionCard, Textarea } from "@/platform/ui_engine";
import { editClientAction, archiveClientAction } from "./actions";

type Client = {
  id: string;
  name: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  address: string | null;
  notes: string | null;
  deleted_at: Date | null;
};

const INITIAL = null;

export function ClientDetailView({ client, canManage }: { client: Client; canManage: boolean }) {
  const [editState, editAction, editPending] = useActionState(editClientAction, INITIAL);
  const [archiveState, archiveAction, archivePending] = useActionState(archiveClientAction, INITIAL);

  const editFailure = editState && !editState.ok ? editState.error.safeMessage : null;
  const archiveFailure = archiveState && !archiveState.ok ? archiveState.error.safeMessage : null;

  return (
    <div className="grid gap-6">
      <SectionCard title="Detail klien">
        <form action={editAction} className="grid gap-4 max-w-lg">
          <input type="hidden" name="id" value={client.id} />
          {editFailure ? <InlineError>{editFailure}</InlineError> : null}
          <Field label="Nama klien" required>
            <Input name="name" required maxLength={200} defaultValue={client.name} disabled={!canManage || !!client.deleted_at} />
          </Field>
          <Field label="Nama kontak">
            <Input name="contact_name" maxLength={200} defaultValue={client.contact_name ?? ""} disabled={!canManage || !!client.deleted_at} />
          </Field>
          <Field label="Telepon">
            <Input name="contact_phone" type="tel" maxLength={50} defaultValue={client.contact_phone ?? ""} disabled={!canManage || !!client.deleted_at} />
          </Field>
          <Field label="Email">
            <Input name="contact_email" type="email" maxLength={200} defaultValue={client.contact_email ?? ""} disabled={!canManage || !!client.deleted_at} />
          </Field>
          <Field label="Alamat">
            <Textarea name="address" maxLength={500} rows={2} defaultValue={client.address ?? ""} disabled={!canManage || !!client.deleted_at} />
          </Field>
          <Field label="Catatan internal">
            <Textarea name="notes" maxLength={2000} rows={2} defaultValue={client.notes ?? ""} disabled={!canManage || !!client.deleted_at} />
          </Field>
          {canManage && !client.deleted_at ? (
            <FormActions>
              <Link href="/studioflow/clients" className="text-sm text-action hover:underline">Kembali</Link>
              <Button type="submit" variant="primary" pending={editPending}>Simpan perubahan</Button>
            </FormActions>
          ) : (
            <Link href="/studioflow/clients" className="text-sm text-action hover:underline">← Kembali ke daftar klien</Link>
          )}
        </form>
      </SectionCard>

      {canManage && (
        <SectionCard title="Arsip klien">
          {archiveFailure ? <InlineError>{archiveFailure}</InlineError> : null}
          {client.deleted_at ? (
            <p className="text-sm text-[var(--ui-muted)]">Klien ini sudah diarsipkan.</p>
          ) : (
            <form action={archiveAction} className="grid gap-3">
              <input type="hidden" name="id" value={client.id} />
              <p className="text-sm text-[var(--ui-muted)]">
                Mengarsipkan klien menyembunyikannya dari daftar aktif. Klien dengan project aktif tidak bisa diarsipkan.
              </p>
              <div>
                <Button type="submit" variant="danger" pending={archivePending}>Arsipkan klien</Button>
              </div>
            </form>
          )}
        </SectionCard>
      )}
    </div>
  );
}
