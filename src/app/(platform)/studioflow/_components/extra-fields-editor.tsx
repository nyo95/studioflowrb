"use client";

import { Plus, X } from "lucide-react";

import { SCHEDULE_EXTRA_LABEL_MAX, SCHEDULE_EXTRA_MAX, SCHEDULE_EXTRA_VALUE_MAX, type ScheduleExtraField } from "@/apps/studioflow/domain/schedule";
import { Button, Input, Text } from "@/platform/ui_engine";

/**
 * Free-form spec lines on a schedule option or template item. The fields every
 * card carries (brand, type, color, pattern, finishing, size, notes) are typed
 * columns; this is for the rest — "Abrasion class / PEI IV" — so a spec sheet
 * can be complete without a schema change per attribute.
 *
 * It edits the surrounding form's draft, so there is no save button of its own.
 */
export function ExtraFieldsEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: readonly ScheduleExtraField[];
  onChange: (next: ScheduleExtraField[]) => void;
  disabled?: boolean;
}) {
  const setAt = (index: number, patch: Partial<ScheduleExtraField>) =>
    onChange(value.map((field, position) => (position === index ? { ...field, ...patch } : field)));

  return (
    <div className="grid gap-2">
      <Text weight="semibold" size="sm">More specs</Text>
      {value.length === 0 ? (
        <Text size="sm" tone="tertiary">Nothing extra yet. Add a line for anything the fields above do not cover.</Text>
      ) : (
        <ul className="m-0 grid list-none gap-1.5 p-0">
          {value.map((field, index) => (
            <li key={index} className="flex items-center gap-1.5">
              <Input
                aria-label={`Spec label ${index + 1}`}
                placeholder="Label"
                className="w-[9rem] shrink-0"
                value={field.label}
                disabled={disabled}
                maxLength={SCHEDULE_EXTRA_LABEL_MAX}
                onChange={(event) => setAt(index, { label: event.target.value })}
              />
              <Input
                aria-label={`Spec value ${index + 1}`}
                placeholder="Value"
                value={field.value}
                disabled={disabled}
                maxLength={SCHEDULE_EXTRA_VALUE_MAX}
                onChange={(event) => setAt(index, { value: event.target.value })}
              />
              <button
                type="button"
                aria-label={`Remove ${field.label || `spec ${index + 1}`}`}
                disabled={disabled}
                onClick={() => onChange(value.filter((_, position) => position !== index))}
                className="shrink-0 rounded-control p-1 text-ink-tertiary hover:bg-surface-muted hover:text-ink"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="justify-self-start"
        disabled={disabled || value.length >= SCHEDULE_EXTRA_MAX}
        leadingIcon={<Plus className="h-3.5 w-3.5" />}
        onClick={() => onChange([...value, { label: "", value: "" }])}
      >
        Add spec line
      </Button>
    </div>
  );
}
