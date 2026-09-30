"use client";

import { UserPlus, X } from "lucide-react";

import { Button, Checkbox, Field, IconButton, Input, Select, Text } from "@/platform/ui_engine";

import { PhoneNumbersField, contactPhoneList } from "../contact-phones";

export type BrandContactDraft = {
  id?: string;
  vendorId: string;
  personName: string;
  jobTitle: string;
  email: string;
  phones: string[];
  isPrimary: boolean;
  notes: string;
};

type SavedContact = { id: string; vendor_id: string; person_name: string; job_title: string | null; email: string | null; phone: string | null; extra_phones: string[]; is_primary: boolean; notes: string | null };

export function brandContactDrafts(contacts: readonly SavedContact[]): BrandContactDraft[] {
  return contacts.map((c) => ({
    id: c.id,
    vendorId: c.vendor_id,
    personName: c.person_name,
    jobTitle: c.job_title ?? "",
    email: c.email ?? "",
    phones: contactPhoneList(c),
    isPrimary: c.is_primary,
    notes: c.notes ?? "",
  }));
}

/** What the form posts: blank cards are dropped, blank phone rows are trimmed away. */
export function serializeBrandContacts(drafts: readonly BrandContactDraft[]): string {
  return JSON.stringify(drafts.filter((draft) => draft.personName.trim()).map((draft) => ({ ...draft, phones: draft.phones.map((phone) => phone.trim()).filter(Boolean) })));
}

/**
 * Contacts at this Brand's suppliers, entered from the Brand itself so nobody has to open each Supplier.
 * Every contact belongs to the Brand's owner or one of its suppliers; they also show up on that Supplier scoped to this Brand.
 */
export function BrandContactsEditor({ value, onChange, vendorChoices }: { value: BrandContactDraft[]; onChange: (next: BrandContactDraft[]) => void; vendorChoices: ReadonlyArray<{ id: string; name: string }> }) {
  const update = (index: number, patch: Partial<BrandContactDraft>) => onChange(value.map((draft, i) => (i === index ? { ...draft, ...patch } : draft)));
  const allowed = new Set(vendorChoices.map((vendor) => vendor.id));
  return (
    <div className="grid gap-2 border-t border-line pt-3">
      <div className="flex items-center justify-between gap-2">
        <div className="grid">
          <Text size="sm" weight="semibold">Supplier contacts</Text>
          <Text size="sm" tone="secondary">People to call for this Brand at its owner or suppliers. They also appear on that Supplier.</Text>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={vendorChoices.length === 0}
          leadingIcon={<UserPlus size={14} aria-hidden="true" />}
          onClick={() => onChange([...value, { vendorId: vendorChoices.length === 1 ? vendorChoices[0].id : "", personName: "", jobTitle: "", email: "", phones: [""], isPrimary: false, notes: "" }])}
        >
          Add contact
        </Button>
      </div>
      {vendorChoices.length === 0 ? <Text size="sm" tone="tertiary">Choose the Brand&apos;s owner or at least one supplier above, then you can add contacts.</Text> : null}
      {value.map((contact, index) => (
        <div key={contact.id ?? `new-${index}`} className="relative grid grid-cols-2 gap-2 rounded border border-line bg-surface-muted/40 p-2.5">
          <IconButton
            label="Remove contact"
            title="Remove"
            size="sm"
            icon={<X size={14} />}
            onClick={() => onChange(value.filter((_, i) => i !== index))}
            className="absolute right-2 top-2 !h-6 !w-6 !min-h-6 !border-0 !bg-transparent !p-0 !text-ink-tertiary hover:!bg-transparent hover:!text-danger"
          />
          <Field label="Supplier" className="col-span-2" description={contact.vendorId && !allowed.has(contact.vendorId) ? "This supplier is no longer on the Brand. Pick another or remove the contact." : undefined}>
            <Select value={contact.vendorId} onChange={(event) => update(index, { vendorId: event.target.value })}>
              <option value="">Select supplier</option>
              {vendorChoices.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
            </Select>
          </Field>
          <Field label="Contact name" className="col-span-2 sm:col-span-1">
            <Input value={contact.personName} maxLength={128} onChange={(event) => update(index, { personName: event.target.value })} />
          </Field>
          <Field label="Job title" className="col-span-2 sm:col-span-1">
            <Input value={contact.jobTitle} maxLength={64} onChange={(event) => update(index, { jobTitle: event.target.value })} />
          </Field>
          <PhoneNumbersField value={contact.phones} onChange={(phones) => update(index, { phones })} />
          <Field label="Email address" className="self-start">
            <Input type="email" value={contact.email} onChange={(event) => update(index, { email: event.target.value })} />
          </Field>
          <Checkbox className="col-span-2 text-sm text-ink-secondary" checked={contact.isPrimary} onCheckedChange={(checked) => update(index, { isPrimary: checked === true })} label="Primary contact" />
        </div>
      ))}
    </div>
  );
}
