"use client";

import { useActionState, useState, useTransition } from "react";
import { ShieldPlus } from "lucide-react";

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
  SectionCard,
  Spinner,
  StatusBadge,
  TableCell,
  TableCellContent,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  buttonClasses,
} from "@/platform/ui_engine";
import { archiveRoleAction, createRoleAction, replaceRoleGrantsAction, updateRoleAction } from "./actions";

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
  const [createOpen, setCreateOpen] = useState(false);
  const [grantsTarget, setGrantsTarget] = useState<RoleRow | null>(null);
  const [editTarget, setEditTarget] = useState<RoleRow | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<RoleRow | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const [createState, createAction, createPending] = useActionState(createRoleAction, null);
  const [editState, editAction, editPending] = useActionState(updateRoleAction, null);
  const [grantsState, grantsAction, grantsPending] = useActionState(replaceRoleGrantsAction, null);

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
      {integrityIssues.length > 0 ? (
        <div role="status" style={{ marginBottom: 12 }}>
          <Notice
            tone="warning"
            title={`${integrityIssues.length} unknown persisted permission${integrityIssues.length === 1 ? "" : "s"}`}
          >
            Grants referencing permissions no longer in the code registry:{" "}
            {integrityIssues.map((issue) => `${issue.roleCode} → ${issue.permissionId}`).join(", ")}. They grant nothing.
          </Notice>
        </div>
      ) : null}

      {canManage ? (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <Button type="button" variant="primary" onClick={() => setCreateOpen(true)}>
            <ShieldPlus aria-hidden="true" />
            <span>New role</span>
          </Button>
        </div>
      ) : null}

      {roles.length === 0 ? (
        <EmptyState title="No roles yet" description="Create a role and grant it registered permissions." />
      ) : (
        <DataTable minWidth={860}>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Permissions</TableHead>
              <TableHead>Status</TableHead>
              <TableHead align="end">Members</TableHead>
              {canManage ? <TableHead align="end">Actions</TableHead> : null}
            </TableRow>
          </TableHeader>
          <tbody>
            {roles.map((role) => (
              <TableRow key={role.id}>
                <TableCell data-column="identifier">{role.code}</TableCell>
                <TableCell>
                  <TableCellContent primary={role.name} secondary={role.description ?? undefined} />
                </TableCell>
                <TableCell wrap>
                  <TableCellContent primary={`${role.permissionIds.length} granted`} secondary={role.permissionIds.join(", ") || undefined} />
                </TableCell>
                <TableCell>
                  {role.archivedAt ? (
                    <StatusBadge tone="neutral">Archived</StatusBadge>
                  ) : role.isSystem ? (
                    <StatusBadge tone="warning">System</StatusBadge>
                  ) : (
                    <StatusBadge tone="success">Active</StatusBadge>
                  )}
                </TableCell>
                <TableCell align="end">{role.activeAssignmentCount}</TableCell>
                {canManage ? (
                  <TableCell align="end">
                    <div style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {!role.archivedAt ? (
                        <>
                          <button type="button" className={buttonClasses("secondary", "sm")} onClick={() => setGrantsTarget(role)}>
                            Grants
                          </button>
                          {!role.isSystem ? (
                            <>
                              <button type="button" className={buttonClasses("secondary", "sm")} onClick={() => setEditTarget(role)}>
                                Edit
                              </button>
                              <button type="button" className={buttonClasses("danger", "sm")} onClick={() => setConfirmArchive(role)}>
                                Archive
                              </button>
                            </>
                          ) : null}
                        </>
                      ) : (
                        <span aria-hidden="true">—</span>
                      )}
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </tbody>
        </DataTable>
      )}

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen} title="New role" description="Role codes are immutable lowercase identifiers.">
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
          {createState && !createState.ok ? <InlineError>{createState.error.safeMessage}</InlineError> : null}
          <FormActions>
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={createPending}>
              {createPending ? <Spinner aria-hidden="true" /> : null}
              <span>Create role</span>
            </Button>
          </FormActions>
        </form>
      </Dialog>

      {/* Edit details */}
      <Dialog open={editTarget !== null} onOpenChange={() => setEditTarget(null)} title="Edit role" size="sm">
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
            {editState && !editState.ok ? <InlineError>{editState.error.safeMessage}</InlineError> : null}
            <FormActions>
              <Button type="button" variant="ghost" onClick={() => setEditTarget(null)}>
                Close
              </Button>
              <Button type="submit" variant="primary" disabled={editPending}>
                {editPending ? <Spinner aria-hidden="true" /> : null}
                <span>Save</span>
              </Button>
            </FormActions>
          </form>
        ) : null}
      </Dialog>

      {/* Grants editor */}
      <Dialog open={grantsTarget !== null} onOpenChange={() => setGrantsTarget(null)} title={`Grants — ${grantsTarget?.name ?? ""}`} description="Every selected permission must be registered; the change is atomic.">
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
            {grantsState && !grantsState.ok ? <InlineError>{grantsState.error.safeMessage}</InlineError> : null}
            {grantsState?.ok ? (
              <Notice tone="success" title="Grants updated" />
            ) : null}
            <FormActions>
              <Button type="button" variant="ghost" onClick={() => setGrantsTarget(null)}>
                Close
              </Button>
              <Button type="submit" variant="primary" disabled={grantsPending}>
                {grantsPending ? <Spinner aria-hidden="true" /> : null}
                <span>Save grants</span>
              </Button>
            </FormActions>
          </form>
        ) : null}
      </Dialog>

      {/* Archive confirmation */}
      <ConfirmDialog
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
    </SectionCard>
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
    <div style={{ display: "grid", gap: 6, maxHeight: 240, overflow: "auto", padding: "4px 0" }}>
      {permissions.map((permission) => (
        <label key={permission} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input
            type="checkbox"
            name={name}
            value={permission}
            defaultChecked={checkedIds.includes(permission)}
            style={{ width: 15, height: 15 }}
          />
          <span style={{ fontFamily: "var(--ui-font-mono)", fontSize: 12 }}>{permission}</span>
        </label>
      ))}
    </div>
  );
}
