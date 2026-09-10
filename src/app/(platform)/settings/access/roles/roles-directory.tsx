"use client";
import {
  Checkbox,
  SearchField,
} from "@/platform/ui_engine";
import { RowActionMenu } from "@/platform/ui_engine";
import { useDisplaySettings } from "@/platform/authenticated-shell/display-settings";
import { DirectoryShell,DraftDialog,Pagination,Text,usePagination } from "@/platform/ui_engine";


import { ShieldPlus } from "lucide-react";
import { useActionState,useState,useTransition } from "react";

import { Button,ConfirmDialog,DataTable,EmptyState,EntityPrimaryCell,Field,FormActions,InlineError,Input,Notice,Spinner,TableBody,TableCell,TableCellContent,TableHead,TableHeader,TableRow,TableToolbar,Textarea } from "@/platform/ui_engine";
import { archiveRoleAction,createRoleAction,replaceRoleGrantsAction,updateRoleAction } from "./actions";

type RoleRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  archivedAt: string | null;
  activeAssignmentCount: number;
  permissionIds: string[];
};

export function RolesDirectory({
  roles,
  registryPermissions,
  canManage,
  integrityIssues,
}: {
  roles: RoleRow[];
  registryPermissions: readonly string[];
  canManage: boolean;
  integrityIssues: { roleId: string; roleCode: string; permissionId: string }[];
}) {
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [grantsTarget, setGrantsTarget] = useState<RoleRow | null>(null);
  const [editTarget, setEditTarget] = useState<RoleRow | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<RoleRow | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const [createState, createAction, createPending] = useActionState(async (previous: Parameters<typeof createRoleAction>[0], data: FormData) => { const result = await createRoleAction(previous, data); if (result.ok) { setCreateOpen(false); } return result; }, null);
  const [editState, editAction, editPending] = useActionState(async (previous: Parameters<typeof updateRoleAction>[0], data: FormData) => { const result = await updateRoleAction(previous, data); if (result.ok) { setEditTarget(null); } return result; }, null);
  const [grantsState, grantsAction, grantsPending] = useActionState(async (previous: Parameters<typeof replaceRoleGrantsAction>[0], data: FormData) => { const result = await replaceRoleGrantsAction(previous, data); if (result.ok) { setGrantsTarget(null); } return result; }, null);

  const runRowAction = (id: string, command: () => Promise<unknown>, onSuccess?: () => void) => {
    if (pendingId) return;
    setPendingId(id); setRowError(null);
    startTransition(async () => {
      try {
        const result = await command();
        if (result && typeof result === "object" && "ok" in result && result.ok === false) {
          const failure = result as { error?: { safeMessage?: string } };
          setRowError(failure.error?.safeMessage ?? "The action could not be completed."); return;
        }
        onSuccess?.();
      } catch { setRowError("The action could not be completed. Please try again."); }
      finally { setPendingId(null); }
    });
  };


  const { locale } = useDisplaySettings();
  const [sortKey, setSortKey] = useState<"Name" | "Code">("Name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const sortValues: Record<"Name" | "Code", (r: RoleRow) => string | number | null> = {"Name": (r) => r.name, "Code": (r) => r.code};
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  const filteredRecords = roles.filter(row => `${row.name} ${row.code}`.toLowerCase().includes(query.toLowerCase()));
  const orderedRows = [...filteredRecords].sort((a, b) => {
    const left = sortValues[sortKey](a), right = sortValues[sortKey](b);
    if (left === null || right === null) return left === right ? a.id.localeCompare(b.id) : left === null ? 1 : -1;
    const result = typeof left === "number" && typeof right === "number" ? left - right : collator.compare(String(left), String(right));
    return (sortDirection === "asc" ? result : -result) || a.id.localeCompare(b.id);
  });
  const paging = usePagination(orderedRows.length, 25, JSON.stringify([query, sortKey, sortDirection]));
  const visibleRows = orderedRows.slice(paging.offset, paging.offset + 25);
  const pageFooter = <div className="grid gap-2"><Text tone="secondary" size="sm">{orderedRows.length ? paging.offset + 1 : 0}–{Math.min(paging.offset + 25, orderedRows.length)} of {orderedRows.length} records</Text>{paging.pageCount > 1 ? <Pagination page={paging.page} pageCount={paging.pageCount} onPageChange={paging.setPage} /> : null}</div>;
return (
    <DirectoryShell fill header={rowError ? <InlineError>{rowError}</InlineError> : undefined} surface pagination={pageFooter} toolbar={<TableToolbar framed={false} actions={canManage ? (
        <Button type="button" variant="primary" onClick={() => setCreateOpen(true)}>
          <ShieldPlus aria-hidden="true" />
          <span>New role</span>
        </Button>
      ) : undefined} ><SearchField label="Search roles" value={query} onChange={event => setQuery(event.target.value)} onClear={() => setQuery("")} /></TableToolbar>}>
      {integrityIssues.length > 0 ? (
        <div role="status" className="mb-3">
          <Notice
            tone="warning"
            title={`${integrityIssues.length} unknown persisted permission${integrityIssues.length === 1 ? "" : "s"}`}
          >
            Grants referencing permissions no longer in the code registry:{" "}
            {integrityIssues.map((issue) => `${issue.roleCode} → ${issue.permissionId}`).join(", ")}. They grant nothing.
          </Notice>
        </div>
      ) : null}



      {orderedRows.length === 0 ? (
        <EmptyState title="No roles yet" description="Create a role and grant it registered permissions." />
      ) : (
        <DataTable framed={false} density="compact" stickyHeader fill minWidth={780}>
          <TableHeader>
            <TableRow>
              <TableHead sortable sortDirection={sortKey === "Name" ? sortDirection : null} onSortChange={(direction) => { setSortKey("Name"); setSortDirection(direction); }}>Role</TableHead>
              <TableHead>Permissions</TableHead>
              <TableHead align="end">Members</TableHead>
              {canManage ? <TableHead stickyEnd align="end">Actions</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((role) => (
              <TableRow key={role.id}>
                <TableCell data-column="identifier"><EntityPrimaryCell tone={role.archivedAt ? "danger" : role.isSystem ? "warning" : "success"} statusLabel={role.archivedAt ? "Archived" : role.isSystem ? "System" : "Active"} name={role.name} secondary={<span>{role.code}{role.description ? ` · ${role.description}` : ""}</span>} /></TableCell>
                <TableCell wrap>
                  <TableCellContent primary={`${role.permissionIds.length} granted`} secondary={role.permissionIds.join(", ") || undefined} />
                </TableCell>
                <TableCell align="end"><TableCellContent align="end" primary={role.activeAssignmentCount.toLocaleString()} /></TableCell>
                {canManage ? (
                  <TableCell align="end" stickyEnd><RowActionMenu label={`Actions for ${role.name}`} pending={pendingId === role.id} items={role.archivedAt ? [] : [{label:"Permissions",onSelect:()=>setGrantsTarget(role)},...(!role.isSystem ? [{label:"Edit",onSelect:()=>setEditTarget(role)},{label:"Archive",danger:true,separatorBefore:true,onSelect:()=>setConfirmArchive(role)}] : [])]} /></TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </DataTable>
      )}

      {/* Create */}
      <DraftDialog pending={createPending} open={createOpen} onOpenChange={setCreateOpen} title="New role" description="Role codes are immutable lowercase identifiers.">
        <form action={createAction}>
          <Field id="role-code" label="Code">
            <Input id="role-code" name="code" required pattern="[a-z][a-z0-9-]{0,63}" placeholder="pricing-viewer" />
          </Field>
          <Field id="role-name" label="Name">
            <Input id="role-name" name="name" required maxLength={120} />
          </Field>
          <Field id="role-description" label="Description">
            <Textarea id="role-description" name="description" maxLength={500} rows={2} />
          </Field>
          <Field id="role-grants" label="Permissions">
            <PermissionCheckboxes name="permissionIds" permissions={registryPermissions} />
          </Field>
          {createState?.ok === false ? <InlineError>{createState.error.safeMessage}</InlineError> : null}
          <FormActions>
            <Button data-dialog-cancel type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" pending={createPending}>
              {createPending ? <Spinner aria-hidden="true" /> : null}
              <span>Create role</span>
            </Button>
          </FormActions>
        </form>
      </DraftDialog>

      {/* Edit details */}
      <DraftDialog pending={editPending} open={editTarget !== null} onOpenChange={() => setEditTarget(null)} title="Edit role" size="sm">
        {editTarget ? (
          <form
            action={(formData) => {
              formData.set("roleId", editTarget.id);
              editAction(formData);
            }}
          >
            <Field id="edit-role-name" label="Name">
              <Input id="edit-role-name" name="name" defaultValue={editTarget.name} required maxLength={120} />
            </Field>
            <Field id="edit-role-description" label="Description">
              <Textarea id="edit-role-description" name="description" defaultValue={editTarget.description ?? ""} maxLength={500} rows={2} />
            </Field>
            {editState?.ok === false ? <InlineError>{editState.error.safeMessage}</InlineError> : null}
            <FormActions>
              <Button type="button" variant="ghost" onClick={() => setEditTarget(null)}>
                Close
              </Button>
              <Button type="submit" variant="primary" pending={editPending}>
                {editPending ? <Spinner aria-hidden="true" /> : null}
                <span>Save</span>
              </Button>
            </FormActions>
          </form>
        ) : null}
      </DraftDialog>

      {/* Grants editor */}
      <DraftDialog pending={grantsPending} open={grantsTarget !== null} onOpenChange={() => setGrantsTarget(null)} title={`Grants — ${grantsTarget?.name ?? ""}`} description="Every selected permission must be registered; the change is atomic.">
        {grantsTarget ? (
          <form
            action={(formData) => {
              formData.set("roleId", grantsTarget.id);
              grantsAction(formData);
            }}
          >
            <input type="hidden" name="roleId" value={grantsTarget.id} />
            <PermissionCheckboxes
              name="permissionIds"
              permissions={registryPermissions}
              checkedIds={grantsTarget.permissionIds}
            />
            {grantsState?.ok === false ? <InlineError>{grantsState.error.safeMessage}</InlineError> : null}
            {grantsState?.ok ? (
              <Notice tone="success" title="Grants updated" />
            ) : null}
            <FormActions>
              <Button type="button" variant="ghost" onClick={() => setGrantsTarget(null)}>
                Close
              </Button>
              <Button type="submit" variant="primary" pending={grantsPending}>
                {grantsPending ? <Spinner aria-hidden="true" /> : null}
                <span>Save grants</span>
              </Button>
            </FormActions>
          </form>
        ) : null}
      </DraftDialog>

      {/* Archive confirmation */}
      <ConfirmDialog error={rowError} pending={pendingId !== null}
        open={confirmArchive !== null}
        onOpenChange={() => setConfirmArchive(null)}
        title={`Archive ${confirmArchive?.name ?? "role"}?`}
        description="Archived roles grant nothing and cannot be newly assigned. Roles with active members cannot be archived."
        confirmLabel="Archive role"
        tone="danger"
        onConfirm={() => {
          const target = confirmArchive;
          setConfirmArchive(null);
          if (target) runRowAction(target.id, () => archiveRoleAction(target.id));
        }}
      />
    </DirectoryShell>
  );
}

function PermissionCheckboxes({
  name,
  permissions,
  checkedIds = [],
}: {
  name: string;
  permissions: readonly string[];
  checkedIds?: readonly string[];
}) {
  return (
    <div className="grid max-h-[240px] gap-1.5 overflow-auto py-1">
      {permissions.map((permission) => (
        <Checkbox
          key={permission}
          name={name}
          value={permission}
          defaultChecked={checkedIds.includes(permission)}
          label={<span className="font-ui-mono text-xs">{permission}</span>}
        />
      ))}
    </div>
  );
}
