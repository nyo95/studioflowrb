"use client";

import { useActionState } from "react";

import { Button, Field, InlineError, Input, SectionCard, Text, Textarea } from "@/platform/ui_engine";
import type { ActionResult } from "@platform/core/actions";
import { updateQuotationSettingsAction } from "./actions";

type Settings = {
  companyAddress: string | null;
  companyEmail: string | null;
  signerName: string | null;
  defaultPaymentTerms: string;
  defaultPpnPct: string;
};

export function QuotationSettingsForm({ settings, signatureUrl, organizationName, hasLogo }: {
  settings: Settings;
  signatureUrl: string | null;
  organizationName: string;
  hasLogo: boolean;
}) {
  const [state, action, pending] = useActionState(updateQuotationSettingsAction, null as ActionResult<{ saved: true }> | null);
  return (
    <form action={action} className="grid max-w-3xl gap-4">
      <SectionCard title="Letterhead" description={`The logo is ${organizationName}'s Brand mark from the platform settings${hasLogo ? "" : " (none uploaded yet, so the name is printed)"}; these lines print under it on the first page.`}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field id="bq-company-address" label="Address" description="One line per row, as printed.">
            <Textarea id="bq-company-address" name="companyAddress" rows={3} maxLength={2000} defaultValue={settings.companyAddress ?? ""} placeholder={"Jalan …\nKelurahan …\nKota - Kode pos"} />
          </Field>
          <Field id="bq-company-email" label="E-mail">
            <Input id="bq-company-email" name="companyEmail" type="email" maxLength={254} defaultValue={settings.companyEmail ?? ""} placeholder="info@…" />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Signature" description="Printed in the left box of the signature block.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field id="bq-signer" label="Signer name">
            <Input id="bq-signer" name="signerName" maxLength={120} defaultValue={settings.signerName ?? ""} />
          </Field>
          <Field id="bq-signature" label="Signature image" description="PNG up to 1 MB; a transparent background prints best.">
            <div className="grid gap-2">
              {signatureUrl ? (
                // A short-lived signed URL; next/image optimization would cache it.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={signatureUrl} alt="Current signature" className="h-20 w-auto justify-self-start rounded-control border border-line bg-white object-contain p-1" />
              ) : null}
              <input id="bq-signature" name="signatureFile" type="file" accept="image/png,.png" className="text-sm" />
              {signatureUrl ? <label className="flex items-center gap-2 text-sm"><input name="removeSignature" type="checkbox" /> Remove the current signature</label> : null}
            </div>
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Defaults" description="Used by every project that has not set its own.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field id="bq-payment-terms" label="Payment terms" description={'One per line, e.g. "50% Down Payment".'}>
            <Textarea id="bq-payment-terms" name="defaultPaymentTerms" rows={4} maxLength={2000} defaultValue={settings.defaultPaymentTerms} />
          </Field>
          <Field id="bq-ppn" label="PPN (%)" description="0 prints no PPN row.">
            <Input id="bq-ppn" name="defaultPpnPct" inputMode="decimal" maxLength={8} defaultValue={settings.defaultPpnPct} />
          </Field>
        </div>
      </SectionCard>

      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" pending={pending}>Save</Button>
        {state && !state.ok ? <InlineError>{state.error.safeMessage}</InlineError> : null}
        {state?.ok ? <Text size="sm" tone="secondary">Saved.</Text> : null}
      </div>
    </form>
  );
}
