"use client";

import { Avatar, Select } from "@/platform/ui_engine";

export type Person = { id: string; displayName: string; active: boolean };

export function PersonChip({ person }: { person: Person | undefined | null }) {
  if (!person) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-secondary" title={person.active ? person.displayName : `${person.displayName} (disabled)`}>
      <Avatar name={person.displayName} size="sm" />
      <span className={person.active ? "" : "line-through"}>{person.displayName}</span>
    </span>
  );
}

export function PersonSelect({
  people,
  value,
  onChange,
  emptyLabel = "Unassigned",
  id,
  name,
  required,
}: {
  people: readonly Person[];
  value: string | null;
  onChange?: (value: string | null) => void;
  emptyLabel?: string;
  id?: string;
  name?: string;
  required?: boolean;
}) {
  const known = value && !people.some((p) => p.id === value);
  return (
    <Select id={id} name={name} required={required} value={value ?? ""} onChange={(event) => onChange?.(event.target.value || null)}>
      {required ? <option value="" disabled>Select a person…</option> : <option value="">{emptyLabel}</option>}
      {known ? <option value={value!}>Former assignee</option> : null}
      {people.map((person) => (
        <option key={person.id} value={person.id}>{person.displayName}</option>
      ))}
    </Select>
  );
}
