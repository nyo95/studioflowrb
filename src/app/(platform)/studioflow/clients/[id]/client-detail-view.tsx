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

export function ClientDetailView({
  client,
  canManage,
  liveProjectCount,
}: {
  client: Client;
  canManage: boolean;
  liveProjectCount: number;
}) {
  const [editState, editAction, editPending] = useActionState(editClientAction, INITIAL);
  const [archiveState, archiveAction, archivePending] = useActionState(archiveClientAction, INITIAL);

  const editFailure = editState?.ok === false ? editState.error.safeMessage : null;
  const archiveFailure = archiveState?.ok === false ? archiveState.error.safeMessage : null;

  return (
    <div className="grid gap-6">
      <SectionCard title="Client details">
        <form action={editAction} className="grid gap-4 max-w-lg">
          <input type="hidden" name="id" value={client.id} />
          {editFailure ? <InlineError>{editFailure}</InlineError> : null}
          <Field label="Client name" required>
            <Input name="name" required maxLength={200} defaultValue={client.name} disabled={!canManage || !!client.deleted_at} />
          </Field>
          <Field label="Contact name">
            <Input name="contact_name" maxLength={200} defaultValue={client.contact_name ?? ""} disabled={!canManage || !!client.deleted_at} />
          </Field>
          <Field label="Phone">
            <Input name="contact_phone" type="tel" maxLength={50} defaultValue={client.contact_phone ?? ""} disabled={!canManage || !!client.deleted_at} />
          </Field>
          <Field label="Email">
            <Input name="contact_email" type="email" maxLength={200} defaultValue={client.contact_email ?? ""} disabled={!canManage || !!client.deleted_at} />
          </Field>
          <Field label="Address">
            <Textarea name="address" maxLength={500} rows={2} defaultValue={client.address ?? ""} disabled={!canManage || !!client.deleted_at} />
          </Field>
          <Field label="Internal notes">
            <Textarea name="notes" maxLength={2000} rows={2} defaultValue={client.notes ?? ""} disabled={!canManage || !!client.deleted_at} />
          </Field>
          {canManage && !client.deleted_at ? (
            <FormActions>
              <Link href="/studioflow/clients" className="text-sm text-action hover:underline">Back</Link>
              <Button type="submit" variant="primary" pending={editPending}>Save changes</Button>
            </FormActions>
          ) : (
            <Link href="/studioflow/clients" className="text-sm text-action hover:underline">← Back to clients</Link>
          )}
        </form>
      </SectionCard>

      {canManage && (
        <SectionCard title="Archive client">
          {archiveFailure ? <InlineError>{archiveFailure}</InlineError> : null}
          {client.deleted_at ? (
            <p className="text-sm text-ink-tertiary">This client is archived.</p>
          ) : liveProjectCount > 0 ? (
            // Spec §5: archive button must not render when client has live projects
            <p className="text-sm text-ink-tertiary">
              This client cannot be archived because it has{" "}
              <strong className="text-ink">{liveProjectCount} active projects</strong>.
              Complete or delete those projects first.
            </p>
          ) : (
            <form action={archiveAction} className="grid gap-3">
              <input type="hidden" name="id" value={client.id} />
              <p className="text-sm text-ink-tertiary">
                Archiving a client removes it from the active list.
              </p>
              <div>
                <Button type="submit" variant="danger" pending={archivePending}>Archive client</Button>
              </div>
            </form>
          )}
        </SectionCard>
      )}
    </div>
  );
}
