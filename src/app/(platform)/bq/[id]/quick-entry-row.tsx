"use client";

import { ListPlus } from "lucide-react";

import { IconButton, TableCell, TableRow } from "@/platform/ui_engine";

/** The table has one clear door for adding a Work Item: the full form, which can also apply an Assembly. */
export function QuickEntryRow({ disabled, columns, onAdd }: {
  disabled: boolean;
  columns: number;
  onAdd: () => void;
}) {
  return (
    <TableRow data-work-item-add className="hover:!bg-transparent">
      <TableCell colSpan={columns}>
        <IconButton size="sm" variant="ghost" label="Tambah Work Item" icon={<ListPlus aria-hidden="true" />} disabled={disabled} onClick={onAdd} />
      </TableCell>
    </TableRow>
  );
}
