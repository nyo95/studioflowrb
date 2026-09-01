"use client";

import { useEffect, useState, useTransition } from "react";
import { Archive, Plus, RotateCcw, Trash2 } from "lucide-react";

import {
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  EmptyState,
  Field,
  FormActions,
  InlineError,
  Input,
  Notice,
  SearchField,
  SectionCard,
  Spinner,
  StatusBadge,
  TableCell,
  TableCellContent,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
} from "@/platform/ui_engine";
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

  const runRowAction = (id: string, run: () => Promise<unknown>) => {
    setPendingId(id);
    startTransition(async () => {
      try {
        await run();
      } finally {
        setPendingId(null);
      }
    });
  };

  return (
    <SectionCard>
      {successMessage ? <Notice tone="success" title="Saved">{successMessage}</Notice> : null}
      <TableToolbar>
        <SearchField value={query} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)} onClear={() => setQuery("")} placeholder="Search units by code or name..." />
        <div className="ml-auto">
          {canManage ? (
            <Button type="button" variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden="true" />
              <span>New unit</span>
            </Button>
          ) : null}
        </div>
      </TableToolbar>

      {filtered.length === 0 ? (
        <EmptyState title="No units found" description={query ? "No units match your search query." : "Create the first unit to get started."} />
      ) : (
        <DataTable minWidth={620}>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead align="end">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <tbody>
            {filtered.map((unit) => {
              const isPending = pendingId === unit.id;

              return (
                <TableRow key={unit.id}>
                  <TableCell>
                    <TableCellContent primary={<span className="font-mono font-semibold">{displayUnitCode(unit.code)}</span>} />
                  </TableCell>
                  <TableCell>
                    <TableCellContent primary={unit.name} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={unit.status === "ACTIVE" ? "success" : "neutral"}>
                      {unit.status === "ACTIVE" ? "Active" : "Archived"}
                    </StatusBadge>
                  </TableCell>
                  <TableCell align="end">
                    <div className="flex items-center justify-end gap-1.5">
                      {isPending ? <Spinner /> : null}
                      {canManage && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => setEditTarget(unit)} disabled={isPending}>
                            Edit
                          </Button>
                          {unit.status === "ACTIVE" ? (
                            <Button size="sm" variant="ghost" onClick={() => setConfirmArchive(unit)} disabled={isPending} title="Archive">
                              <Archive size={15} />
                            </Button>
                          ) : (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => setConfirmRestore(unit)} disabled={isPending} title="Restore">
                                <RotateCcw size={15} />
                              </Button>
                              <Button size="sm" variant="danger" onClick={() => setDeleteTarget(unit)} disabled={isPending} title="Request deletion">
                                <Trash2 size={15} />
                              </Button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </tbody>
        </DataTable>
      )}

      {/* Create Dialog */}
      <Dialog
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
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={createPending}>
              {createPending ? <Spinner /> : "Create unit"}
            </Button>
          </FormActions>
        </form>
      </Dialog>

      {/* Edit Dialog */}
      {editTarget ? (
        <Dialog
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
            <Field label="Unit code" required>
              <Input name="code" defaultValue={editTarget.code} required maxLength={16} onInput={(event) => { event.currentTarget.value = event.currentTarget.value.toUpperCase(); }} />
            </Field>
            <Field label="Display name" required>
              <Input name="name" defaultValue={editTarget.name} required maxLength={64} />
            </Field>
            <FormActions>
              <Button type="button" variant="ghost" onClick={() => setEditTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={editPending}>
                {editPending ? <Spinner /> : "Save changes"}
              </Button>
            </FormActions>
          </form>
        </Dialog>
      ) : null}

      {/* Archive Confirm */}
      {confirmArchive ? (
        <ConfirmDialog
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
            setConfirmArchive(null);
            runRowAction(target.id, () => archiveUnitAction(target.id));
          }}
        />
      ) : null}

      {/* Restore Confirm */}
      {confirmRestore ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirmRestore(null);
          }}
          title={`Restore unit ${confirmRestore.code}?`}
          description="Restoring this unit makes it active and selectable for new SKUs and pricing."
          confirmLabel="Restore unit"
          onConfirm={() => {
            const target = confirmRestore;
            setConfirmRestore(null);
            runRowAction(target.id, () => restoreUnitAction(target.id));
          }}
        />
      ) : null}

      {/* Request Deletion Dialog */}
      {deleteTarget ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
          title={`Submit unit ${displayUnitCode(deleteTarget.code)} for deletion`}
          description="Archived units with zero dependencies can be permanently purged after approval by a user with the deletion approval permission."
        >
          <div className="grid gap-4">
            <Field label="Reason for deletion">
              <Input
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="e.g. Redundant duplicate code created by mistake"
              />
            </Field>
            <FormActions>
              <Button type="button" variant="ghost" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={() => {
                  const target = deleteTarget;
                  const reason = deleteReason;
                  setDeleteTarget(null);
                  setDeleteReason("");
                  runRowAction(target.id, () => requestUnitDeletionAction(target.id, reason));
                }}
              >
                Submit deletion request
              </Button>
            </FormActions>
          </div>
        </Dialog>
      ) : null}
    </SectionCard>
  );
}
