"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, Field, FormActions, InlineError, Input, Textarea } from "@/platform/ui_engine";
import { createClientAction } from "./actions";

const INITIAL = null;

export function ClientForm() {
  const [state, formAction, pending] = useActionState(createClientAction, INITIAL);
  const failure = state && !state.ok ? state.error.safeMessage : null;

  return (
    <form action={formAction} className="grid gap-4 max-w-lg">
      {failure ? <InlineError>{failure}</InlineError> : null}
      <Field label="Nama klien" required>
        <Input name="name" required maxLength={200} autoFocus />
      </Field>
      <Field label="Nama kontak">
        <Input name="contact_name" maxLength={200} />
      </Field>
      <Field label="Telepon">
        <Input name="contact_phone" type="tel" maxLength={50} />
      </Field>
      <Field label="Email">
        <Input name="contact_email" type="email" maxLength={200} />
      </Field>
      <Field label="Alamat">
        <Textarea name="address" maxLength={500} rows={2} />
      </Field>
      <Field label="Catatan internal">
        <Textarea name="notes" maxLength={2000} rows={2} />
      </Field>
      <FormActions>
        <Link href="/studioflow/clients" className="text-sm text-action hover:underline">Batal</Link>
        <Button type="submit" variant="primary" pending={pending}>Simpan klien</Button>
      </FormActions>
    </form>
  );
}
