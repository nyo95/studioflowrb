"use client";

import { Button, Select, Text } from "@/platform/ui_engine";

import type { DirectoryStatus } from "./directory-findability";

/** The Active / Archived / All control every Master Data list uses, so the wording and default match everywhere. */
export function StatusFilterSelect({ value, onChange }: { value: DirectoryStatus; onChange: (value: DirectoryStatus) => void }) {
  return (
    <div className="w-36">
      <Select aria-label="Status" value={value} onChange={(event) => onChange(event.target.value as DirectoryStatus)}>
        <option value="ACTIVE">Active</option>
        <option value="ARCHIVED">Archived</option>
        <option value="ALL">All status</option>
      </Select>
    </div>
  );
}

/** "Clear filters" (only while something is filtering) and the "N of M" result count, placed last in every filter bar. */
export function FilterSummary({ filtered, shown, total, onClear }: { filtered: boolean; shown: number; total: number; onClear: () => void }) {
  return (
    <>
      {filtered ? <Button type="button" variant="ghost" size="sm" onClick={onClear}>Clear filters</Button> : null}
      <Text size="sm" tone="secondary" aria-live="polite">{shown} of {total}</Text>
    </>
  );
}
