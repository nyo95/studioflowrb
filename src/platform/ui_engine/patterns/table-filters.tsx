"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";
import { Drawer } from "../layouts/overlays";
import { Button, FilterChip, Text } from "../primitives";
import { Field } from "../components/forms";
import { Combobox } from "./combobox";

export type TableFilter = {
  id: string;
  label: string;
  value: string;
  defaultValue: string;
  options: Array<{ id: string; label: string }>;
  onValueChange: (value: string) => void;
};

/** Live directory filters. Consumers own options, defaults and filtering policy. */
export function TableFilters({ filters, resultLabel }: { filters: TableFilter[]; resultLabel: string }) {
  const [open, setOpen] = useState(false);
  const active = filters.filter((filter) => filter.value !== filter.defaultValue);
  return <>
    <Button type="button" leadingIcon={<SlidersHorizontal aria-hidden="true" />} onClick={() => setOpen(true)} aria-label={active.length ? `Filters, ${active.length} active` : "Filters"}>
      Filters{active.length ? ` (${active.length})` : ""}
    </Button>
    {active.map((filter) => <FilterChip key={filter.id} selected aria-label={`Remove ${filter.label} filter`} onClick={() => filter.onValueChange(filter.defaultValue)}>
      {filter.label}: {filter.options.find((option) => option.id === filter.value)?.label ?? "Selected"}<X size={12} aria-hidden="true" />
    </FilterChip>)}
    <Drawer open={open} onOpenChange={setOpen} title="Filters" description="Results update as you choose. Close this panel to return to the table." size="sm" footer={<>
      <Button type="button" variant="ghost" disabled={!active.length} onClick={() => filters.forEach((filter) => filter.onValueChange(filter.defaultValue))}>Reset filters</Button>
      <Button type="button" variant="primary" onClick={() => setOpen(false)}>Show results</Button>
    </>}>
      <div className="grid gap-5">
        <Text role="status" tone="secondary" size="sm">{resultLabel}</Text>
        {filters.map((filter) => <Field key={filter.id} label={filter.label}>
          <Combobox label={filter.label} options={filter.options} value={filter.value} onValueChange={filter.onValueChange} searchPlaceholder={`Search ${filter.label.toLowerCase()}…`} />
        </Field>)}
      </div>
    </Drawer>
  </>;
}
