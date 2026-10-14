"use client";

import { useState } from "react";

import { Button, Dialog, Field, FilterChip, Input, Text, Textarea } from "@/platform/ui_engine";
import { BQ_DEFAULT_QUOTATION_TERMS, QUOTATION_TERMS_MAX } from "@/apps/bq/lib/quotation";
import { DEFAULT_VALID_DAYS } from "@/apps/bq/lib/quotation-letter";
import type { BqProjectDetail } from "@/apps/bq/public";

/**
 * The quotation letter (owner 2026-10-14, the studio's quotation PDF): number, date and validity; the addressee;
 * project facts; schedule, payment terms, PPN and rounding; terms. They describe the letter, not the priced content,
 * so a LOCKED project can still be given them. Empty payment terms and PPN print the BQ quotation settings' defaults.
 */
export function QuotationDialog({
  quotation,
  pending,
  onClose,
  onSave,
}: {
  quotation: BqProjectDetail["quotation"];
  pending: boolean;
  onClose: () => void;
  onSave: (fields: Record<string, string>) => Promise<void>;
}) {
  const [fields, setFields] = useState({
    number: quotation.number ?? "",
    date: quotation.date ?? "",
    validUntil: quotation.validUntil ?? "",
    clientContact: quotation.clientContact ?? "",
    clientAddress: quotation.clientAddress ?? "",
    area: quotation.area ?? "",
    location: quotation.location ?? "",
    schedule: quotation.schedule ?? "",
    paymentTerms: quotation.paymentTerms ?? "",
    ppnPct: quotation.ppnPct ?? "",
    rounding: quotation.rounding ?? "",
  });
  const [ownTerms, setOwnTerms] = useState(quotation.terms !== null);
  const [terms, setTerms] = useState(quotation.terms ?? BQ_DEFAULT_QUOTATION_TERMS);
  const set = (name: keyof typeof fields) => (event: { target: { value: string } }) => setFields({ ...fields, [name]: event.target.value });

  const save = () => {
    void onSave({ ...fields, number: fields.number.trim(), terms, useStandardTerms: ownTerms ? "false" : "true" }).catch(() => undefined);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open && !pending) onClose(); }}
      title="Quotation details"
      description="Printed on the quotation. They can still be changed after the project is locked."
      dismissible={!pending}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button variant="primary" pending={pending} onClick={save}>Save</Button>
        </div>
      }
    >
      <div className="grid gap-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Ref# (quotation number)">
            <Input value={fields.number} maxLength={80} onChange={set("number")} placeholder="e.g. RDT/R/26-498/BQ/S1" />
          </Field>
          <Field label="Date" description="Empty prints today's date.">
            <Input type="date" value={fields.date} onChange={set("date")} />
          </Field>
          <Field label="Valid until" description={`Empty prints the date + ${DEFAULT_VALID_DAYS} days.`}>
            <Input type="date" value={fields.validUntil} onChange={set("validUntil")} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="To (contact person)" description="Printed above the client name.">
            <Input value={fields.clientContact} maxLength={200} onChange={set("clientContact")} placeholder="e.g. Pieter Gunawan" />
          </Field>
          <Field label="Client address" description="One line per row.">
            <Textarea rows={3} maxLength={2000} value={fields.clientAddress} onChange={set("clientAddress")} />
          </Field>
          <Field label="Project area">
            <Input value={fields.area} maxLength={200} onChange={set("area")} placeholder="e.g. 103 sqm" />
          </Field>
          <Field label="Project location">
            <Input value={fields.location} maxLength={200} onChange={set("location")} placeholder="e.g. Living World Pekanbaru" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Schedule" description={'e.g. "9 Weeks upon confirmation and subject to stock availabilities of materials." Empty prints no schedule.'}>
            <Textarea rows={2} maxLength={2000} value={fields.schedule} onChange={set("schedule")} />
          </Field>
          <Field label="Payment terms" description={'One per line, e.g. "50% Down Payment". Empty prints the default from Quotation settings.'}>
            <Textarea rows={3} maxLength={2000} value={fields.paymentTerms} onChange={set("paymentTerms")} />
          </Field>
          <Field label="PPN (%)" description="Empty uses the default from Quotation settings; 0 prints no PPN.">
            <Input inputMode="decimal" maxLength={8} value={fields.ppnPct} onChange={set("ppnPct")} placeholder="11" />
          </Field>
          <Field label="Rounding" description="The amount the subtotal is rounded to; PPN is taken on it. Empty prints no rounding row.">
            <Input inputMode="decimal" maxLength={40} value={fields.rounding} onChange={set("rounding")} placeholder="e.g. 1.320.000.000" />
          </Field>
        </div>

        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Text size="sm" weight="semibold">Terms of condition</Text>
            <div className="flex gap-1.5" role="group" aria-label="Terms">
              <FilterChip selected={!ownTerms} onClick={() => setOwnTerms(false)}>Standard terms</FilterChip>
              <FilterChip selected={ownTerms} onClick={() => setOwnTerms(true)}>Own terms</FilterChip>
            </div>
          </div>
          {ownTerms ? (
            <Textarea aria-label="Terms and conditions" rows={7} maxLength={QUOTATION_TERMS_MAX} value={terms} onChange={(event) => setTerms(event.target.value)} />
          ) : (
            <Text tone="secondary" size="sm" className="whitespace-pre-line rounded-control border border-line bg-surface-muted px-3 py-2">{BQ_DEFAULT_QUOTATION_TERMS}</Text>
          )}
          <Text tone="tertiary" size="sm">One term per line; an empty line prints as a gap.</Text>
        </div>
      </div>
    </Dialog>
  );
}
