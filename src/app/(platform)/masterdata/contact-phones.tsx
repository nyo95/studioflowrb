"use client";

import { Plus, X } from "lucide-react";

import { Button, Field, IconButton, Input } from "@/platform/ui_engine";

export const MAX_CONTACT_PHONES = 3;

/** The phone numbers stored for a contact: the first column plus up to two extras, in order. */
export function contactPhoneList(contact: { phone: string | null; extra_phones?: readonly string[] | null }): string[] {
  return [contact.phone, ...(contact.extra_phones ?? [])].filter((value): value is string => Boolean(value && value.trim()));
}

/** Short form for tables: the first number, plus how many more there are. */
export function phoneSummary(phones: readonly string[]): string {
  if (phones.length === 0) return "";
  return phones.length === 1 ? phones[0] : `${phones[0]} +${phones.length - 1}`;
}

/** Up to three numbers for one contact (a person often has an office, a mobile, and a second mobile). */
export function PhoneNumbersField({ value, onChange, label = "Phone numbers" }: { value: readonly string[]; onChange: (next: string[]) => void; label?: string }) {
  const rows = value.length === 0 ? [""] : [...value];
  const set = (index: number, next: string) => onChange(rows.map((row, i) => (i === index ? next : row)));
  return (
    <Field label={label}>
      <div className="grid gap-1.5">
        {rows.map((phone, index) => (
          <div key={index} className="flex items-center gap-1.5">
            <Input
              value={phone}
              inputMode="tel"
              maxLength={32}
              aria-label={`${label} ${index + 1}`}
              placeholder={index === 0 ? "e.g. 021 5819089" : "Another number"}
              onChange={(event) => set(index, event.target.value)}
            />
            {rows.length > 1 ? (
              <IconButton label={`Remove phone number ${index + 1}`} title="Remove number" size="sm" icon={<X size={14} />} onClick={() => onChange(rows.filter((_, i) => i !== index))} />
            ) : null}
          </div>
        ))}
        {rows.length < MAX_CONTACT_PHONES ? (
          <Button type="button" size="sm" variant="ghost" className="justify-self-start" leadingIcon={<Plus size={14} aria-hidden="true" />} onClick={() => onChange([...rows, ""])}>
            Add another number
          </Button>
        ) : null}
      </div>
    </Field>
  );
}
