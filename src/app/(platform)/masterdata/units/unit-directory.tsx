"use client";
import { RequestDeletionDialog } from "../request-deletion-dialog";
import { useDisplaySettings } from "@/platform/authenticated-shell/display-settings";
import { DirectoryShell,DraftDialog,Pagination,RowActionMenu,Text,usePagination } from "@/platform/ui_engine";


import { Plus } from "lucide-react";
import { useState,useTransition } from "react";

import { Button,ConfirmDialog,DataTable,EmptyState,Field,FormActions,InlineError,Input,Notice,SearchField,StatusBadge,TableBody,TableCell,TableCellContent,TableHead,TableHeader,TableRow,TableToolbar } from "@/platform/ui_engine";
import {
archiveUnitAction,
createUnitAction,
requestUnitDeletionAction,
restoreUnitAction,
updateUnitAction,
} from "./actions";

type UnitRow = {
  id: string;
  code: string;
  name: string;
  status: "ACTIVE" | "ARCHIVED";
  archived_at: Date | null;
  _count: {
    base_skus: number;
    purchase_skus: number;
    material_prices: number;
    material_labor_prices: number;
    labor_prices: number;
  };
};

function displayUnitCode(code: string): string {
  return code.replace(/2$/, "²").replace(/3$/, "³");
}

function normalizeUnitQuery(value: string): string {
  return value.toLowerCase().replace(/²/g, "2").replace(/³/g, "3");
}

export function UnitDirectory({
  units,
  canManage,
}: {
  units: UnitRow[];
  canManage: boolean;
}) {
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<UnitRow | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<UnitRow | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<UnitRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UnitRow | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [rowError, setRowError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const [createError, setCreateError] = useState<string | null>(null);
  const [createPending, setCreatePending] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editPending, setEditPending] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const filtered = units.filter((u) => {
    if (!query) return true;
    const q = normalizeUnitQuery(query);
    return u.name.toLowerCase().includes(q) || normalizeUnitQuery(u.code).includes(q);
  });
  const { locale } = useDisplaySettings();
  const [sortKey, setSortKey] = useState<"Name" | "Code">("Name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const sortValues: Record<"Name" | "Code", (r: UnitRow) => string | number | null> = {"Name": (r) => r.name, "Code": (r) => r.code};
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  const orderedRows = [...filtered].sort((a, b) => {
    const left = sortValues[sortKey](a), right = sortValues[sortKey](b);
    if (left === null || right === null) return left === right ? a.id.localeCompare(b.id) : left === null ? 1 : -1;
    const result = typeof left === "number" && typeof right === "number" ? left - right : collator.compare(String(left), String(right));
    return (sortDirection === "asc" ? result : -result) || a.id.localeCompare(b.id);
  });
  const paging = usePagination(orderedRows.length, 25, JSON.stringify([query, sortKey, sortDirection]));
  const visibleRows = orderedRows.slice(paging.offset, paging.offset + 25);
  const pageFooter = <div className="grid gap-2"><Text tone="secondary" size="sm">{orderedRows.length ? paging.offset + 1 : 0}–{Math.min(paging.offset + 25, orderedRows.length)} of {orderedRows.length} records</Text>{paging.pageCount > 1 ? <Pagination page={paging.page} pageCount={paging.pageCount} onPageChange={paging.setPage} /> : null}</div>;


  const runRowAction = (id: string, command: () => Promise<unknown>, onSuccess?: () => void) => {
    if (pendingId) return;
    setPendingId(id); setRowError(null);
    startTransition(async () => {
      try {
        const result = await command();
        if (result && typeof result === "object" && "ok" in result && !result.ok) {
          const failure = result as { error?: { safeMessage?: string } };
          setRowError(failure.error?.safeMessage ?? "The action could not be completed."); return;
        }
        onSuccess?.();
      } catch { setRowError("The action could not be completed. Please try again."); }
      finally { setPendingId(null); }
    });
  };

  return (
    <DirectoryShell header={rowError ? <InlineError>{rowError}</InlineError> : undefined} surface pagination={pageFooter} toolbar={<TableToolbar framed={false} actions={canManage ? (
        <Button type="button" variant="primary" onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden="true" />
          <span>New unit</span>
        </Button>
      ) : undefined}>
        <SearchField value={query} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)} onClear={() => setQuery("")} placeholder="Search units by code or name..." />
      </TableToolbar>}>
      {successMessage ? <Notice tone="success" title="Saved">{successMessage}</Notice> : null}


      {filtered.length === 0 ? (
        <EmptyState
          title="No units found"
          description={query ? "No units match your search query." : "Create the first unit to get started."}

        />
      ) : (
        <DataTable framed={false} density="compact" stickyHeader maxBodyHeight="60vh" minWidth={620}>
          <TableHeader>
            <TableRow>
              <TableHead sortable sortDirection={sortKey === "Code" ? sortDirection : null} onSortChange={(direction) => { setSortKey("Code"); setSortDirection(direction); }}>Code</TableHead>
              <TableHead sortable sortDirection={sortKey === "Name" ? sortDirection : null} onSortChange={(direction) => { setSortKey("Name"); setSortDirection(direction); }}>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead stickyEnd align="end">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((unit) => {
              const isPending = pendingId === unit.id;

              return (
                <TableRow key={unit.id}>
                  <TableCell>
                    <TableCellContent primary={<span className="font-ui-mono font-semibold">{displayUnitCode(unit.code)}</span>} />
                  </TableCell>
                  <TableCell>
                    <TableCellContent primary={unit.name} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={unit.status === "ACTIVE" ? "success" : "neutral"}>
                      {unit.status === "ACTIVE" ? "Active" : "Archived"}
                    </StatusBadge>
                  </TableCell>
                  <TableCell stickyEnd align="end">
                    <RowActionMenu label={`Actions for ${unit.name}`} pending={pendingId === unit.id} items={[...[],...(isPending ? [] : []),...[],...(canManage ? [...[],...[{ label: "Edit", onSelect: () => setEditTarget(unit), disabled: isPending, danger: false, separatorBefore: false }],...[],...(unit.status === "ACTIVE" ? [{ label: "Archive", onSelect: () => setConfirmArchive(unit), disabled: isPending, danger: false, separatorBefore: false }] : [...[],...[{ label: "Restore", onSelect: () => setConfirmRestore(unit), disabled: isPending, danger: false, separatorBefore: false }],...[],...[{ label: "Request deletion", onSelect: () => setDeleteTarget(unit), disabled: isPending, danger: true, separatorBefore: true }],...[]]),...[]] : []),...[]]} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </DataTable>
      )}

      {/* Create Dialog */}
      <DraftDialog pending={createPending}
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Create measurement unit"
        description="Add a new standard unit code (e.g. PCS, M2, KG) used across SKUs and pricing."
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setCreatePending(true);
            setCreateError(null);
            const fd = new FormData(e.currentTarget);
            try {
              const res = await createUnitAction(null, fd);
              if (res && "ok" in res && res.ok) {
                setCreateOpen(false);
                setSuccessMessage("Measurement unit created.");
              } else if (res && "ok" in res && !res.ok) {
                setCreateError(res.error.safeMessage);
              }
            } finally {
              setCreatePending(false);
            }
          }}
          className="grid gap-4"
        >
          {createError ? <InlineError>{createError}</InlineError> : null}
          <Field label="Unit code" required description="Uppercase symbol (e.g. PCS, SET, M2).">
            <Input name="code" required maxLength={16} placeholder="PCS" autoFocus onInput={(event) => { event.currentTarget.value = event.currentTarget.value.toUpperCase(); }} />
          </Field>
          <Field label="Display name" required description="Descriptive name (e.g. Pieces, Set, Square Meter).">
            <Input name="name" required maxLength={64} placeholder="Pieces" />
          </Field>
          <FormActions>
            <Button data-dialog-cancel type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" pending={createPending}>
              {"Create unit"}
            </Button>
          </FormActions>
        </form>
      </DraftDialog>

      {/* Edit Dialog */}
      {editTarget ? (
        <DraftDialog pending={editPending}
          open
          onOpenChange={(open) => {
            if (!open) setEditTarget(null);
          }}
          title={`Edit unit ${editTarget.code}`}
          description="Update unit symbol or descriptive name."
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setEditPending(true);
              setEditError(null);
              const fd = new FormData(e.currentTarget);
              try {
                const res = await updateUnitAction(null, fd);
              if (res && "ok" in res && res.ok) {
                setEditTarget(null);
                setSuccessMessage("Measurement unit updated.");
                } else if (res && "ok" in res && !res.ok) {
                  setEditError(res.error.safeMessage);
                }
              } finally {
                setEditPending(false);
              }
            }}
            className="grid gap-4"
          >
            <input type="hidden" name="unitId" value={editTarget.id} />
            {editError ? <InlineError>{editError}</InlineError> : null}
            <Field label="Unit code" required description="Code is fixed after creation.">
              <Input name="code" defaultValue={editTarget.code} required maxLength={16} readOnly />
            </Field>
            <Field label="Display name" required>
              <Input name="name" defaultValue={editTarget.name} required maxLength={64} />
            </Field>
            <FormActions>
              <Button data-dialog-cancel type="button" variant="ghost" onClick={() => setEditTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" pending={editPending}>
                {"Save changes"}
              </Button>
            </FormActions>
          </form>
        </DraftDialog>
      ) : null}

      {/* Archive Confirm */}
      {confirmArchive ? (
        <ConfirmDialog error={rowError} pending={pendingId !== null}
          open
          onOpenChange={(open) => {
            if (!open) setConfirmArchive(null);
          }}
          title={`Archive unit ${confirmArchive.code}?`}
          description="Archiving this unit prevents new SKUs or prices from selecting it. Existing references remain visible."
          confirmLabel="Archive unit"
          tone="danger"
          onConfirm={() => {
            const target = confirmArchive;

            runRowAction(target.id, () => archiveUnitAction(target.id), () => { setConfirmArchive(null); });
          }}
        />
      ) : null}

      {/* Restore Confirm */}
      {confirmRestore ? (
        <ConfirmDialog error={rowError} pending={pendingId !== null}
          open
          onOpenChange={(open) => {
            if (!open) setConfirmRestore(null);
          }}
          title={`Restore unit ${confirmRestore.code}?`}
          description="Restoring this unit makes it active and selectable for new SKUs and pricing."
          confirmLabel="Restore unit"
          onConfirm={() => {
            const target = confirmRestore;

            runRowAction(target.id, () => restoreUnitAction(target.id), () => { setConfirmRestore(null); });
          }}
        />
      ) : null}

      {/* Request Deletion Dialog */}
      {deleteTarget ? (
        <RequestDeletionDialog open onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }} title={`Submit unit ${displayUnitCode(deleteTarget.code)} for deletion`} description="Archived units with zero dependencies can be permanently purged after approval by a user with the deletion approval permission." reason={deleteReason} onReasonChange={setDeleteReason} placeholder="e.g. Redundant duplicate code created by mistake" pending={pendingId !== null} error={rowError} onSubmit={() => {
                  const target = deleteTarget;
                  const reason = deleteReason;


                  runRowAction(target.id, () => requestUnitDeletionAction(target.id, reason), () => { setDeleteTarget(null); setDeleteReason(""); });
                }} />
      ) : null}
    </DirectoryShell>
  );
}
