"use client";

import { useState } from "react";

import { Button, Dialog, Field, FilterChip, Input, Text, Textarea } from "@/platform/ui_engine";
import { BQ_DEFAULT_QUOTATION_TERMS, QUOTATION_TERMS_MAX } from "@/apps/bq/lib/quotation";
import type { BqProjectDetail } from "@/apps/bq/public";

/**
 * Quotation number, date, and terms. They describe the letter sent to the client, not the priced content, so a
 * LOCKED project can still be given them. Standard terms are the studio's default; "Own terms" starts from that
 * text so the estimator only edits what differs.
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
  const [number, setNumber] = useState(quotation.number ?? "");
  const [date, setDate] = useState(quotation.date ?? "");
  const [ownTerms, setOwnTerms] = useState(quotation.terms !== null);
  const [terms, setTerms] = useState(quotation.terms ?? BQ_DEFAULT_QUOTATION_TERMS);

  const save = () => {
    void onSave({ number: number.trim(), date, terms, useStandardTerms: ownTerms ? "false" : "true" }).catch(() => undefined);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open && !pending) onClose(); }}
      title="Quotation details"
      description="Printed on the quotation. They can still be changed after the project is locked."
      dismissible={!pending}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button variant="primary" pending={pending} onClick={save}>Save</Button>
        </div>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Quotation number">
            <Input value={number} maxLength={80} onChange={(event) => setNumber(event.target.value)} placeholder="e.g. Q-2026-014" />
          </Field>
          <Field label="Quotation date" description="Empty prints today's date.">
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
        </div>
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Text size="sm" weight="semibold">Terms &amp; Conditions</Text>
            <div className="flex gap-1.5" role="group" aria-label="Terms">
              <FilterChip selected={!ownTerms} onClick={() => setOwnTerms(false)}>Standard terms</FilterChip>
              <FilterChip selected={ownTerms} onClick={() => setOwnTerms(true)}>Own terms</FilterChip>
            </div>
          </div>
          {ownTerms ? (
            <Textarea aria-label="Terms and conditions" rows={8} maxLength={QUOTATION_TERMS_MAX} value={terms} onChange={(event) => setTerms(event.target.value)} />
          ) : (
            <Text tone="secondary" size="sm" className="whitespace-pre-line rounded-control border border-line bg-surface-muted px-3 py-2">{BQ_DEFAULT_QUOTATION_TERMS}</Text>
          )}
          <Text tone="tertiary" size="sm">One term per line; each line prints as a numbered point.</Text>
        </div>
      </div>
    </Dialog>
  );
}
