"use client";
import { SearchField } from "@/platform/ui_engine";
import { RowActionMenu } from "@/platform/ui_engine";
import { useDisplaySettings } from "@/platform/authenticated-shell/display-settings";
import { DirectoryShell,DraftDialog,Pagination,Text,usePagination } from "@/platform/ui_engine";


import { UserPlus } from "lucide-react";
import { useActionState,useState,useTransition } from "react";

import { Button,ConfirmDialog,DataTable,EmptyState,Field,FormActions,IconButton,InlineError,Input,Select,Spinner,StatusBadge,TableBody,TableCell,TableCellContent,TableHead,TableHeader,TableRow,TableToolbar } from "@/platform/ui_engine";
import {
assignRoleAction,
createUserAction,
disableUserAction,
removeRoleAction,
restoreUserAction,
setUserPasswordAction,
updateUserDisplayNameAction,
} from "./actions";

type UserRow = {
  id: string;
  email: string;
  displayName: string;
  status: "ACTIVE" | "DISABLED";
  roles: { id: string; code: string; name: string; archived: boolean }[];
};

type RoleOption = { id: string; code: string; name: string };

export function UsersDirectory({
  users,
  roles,
  canManage,
  canAssignRoles,
}: {
  users: UserRow[];
  roles: RoleOption[];
  canManage: boolean;
  canAssignRoles: boolean;
}) {
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<UserRow | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<UserRow | null>(null);
  const [confirmDisable, setConfirmDisable] = useState<UserRow | null>(null);
  const [confirmRemoveRole, setConfirmRemoveRole] = useState<{ user: UserRow; roleId: string; roleName: string } | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const [createState, createAction, createPending] = useActionState(async (previous: Parameters<typeof createUserAction>[0], data: FormData) => { const result = await createUserAction(previous, data); if (result.ok) { setCreateOpen(false); } return result; }, null);
  const [editState, editAction, editPending] = useActionState(async (previous: Parameters<typeof updateUserDisplayNameAction>[0], data: FormData) => { const result = await updateUserDisplayNameAction(previous, data); if (result.ok) { setEditTarget(null); } return result; }, null);
  const [passwordState, passwordAction, passwordPending] = useActionState(async (previous: Parameters<typeof setUserPasswordAction>[0], data: FormData) => { const result = await setUserPasswordAction(previous, data); if (result.ok) { setPasswordTarget(null); } return result; }, null);

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


  const { locale } = useDisplaySettings();
  const [sortKey, setSortKey] = useState<"Display name" | "Email" | "Status">("Display name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const sortValues: Record<"Display name" | "Email" | "Status", (r: UserRow) => string | number | null> = {"Display name": (r) => r.displayName, "Email": (r) => r.email, "Status": (r) => r.status};
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  const filteredRecords = users.filter(row => `${row.displayName} ${row.email}`.toLowerCase().includes(query.toLowerCase()));
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
    <DirectoryShell header={rowError ? <InlineError>{rowError}</InlineError> : undefined} surface pagination={pageFooter} toolbar={<TableToolbar framed={false} actions={canManage ? (
        <Button type="button" variant="primary" onClick={() => setCreateOpen(true)}>
          <UserPlus aria-hidden="true" />
          <span>New user</span>
        </Button>
      ) : undefined} ><SearchField label="Search users" value={query} onChange={event => setQuery(event.target.value)} onClear={() => setQuery("")} /></TableToolbar>}>


      {orderedRows.length === 0 ? (
        <EmptyState title="No users yet" description="Create the first platform account to get started." />
      ) : (
        <DataTable framed={false} density="compact" stickyHeader maxBodyHeight="60vh" minWidth={860}>
          <TableHeader>
            <TableRow>
              <TableHead sortable sortDirection={sortKey === "Email" ? sortDirection : null} onSortChange={(direction) => { setSortKey("Email"); setSortDirection(direction); }}>Email</TableHead>
              <TableHead sortable sortDirection={sortKey === "Display name" ? sortDirection : null} onSortChange={(direction) => { setSortKey("Display name"); setSortDirection(direction); }}>Display name</TableHead>
              <TableHead sortable sortDirection={sortKey === "Status" ? sortDirection : null} onSortChange={(direction) => { setSortKey("Status"); setSortDirection(direction); }}>Status</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead stickyEnd align="end">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((user) => (
              <TableRow key={user.id}>
                <TableCell data-column="identifier">{user.email}</TableCell>
                <TableCell>
                  <TableCellContent primary={user.displayName} />
                </TableCell>
                <TableCell>
                  {user.status === "ACTIVE" ? (
                    <StatusBadge tone="success">Active</StatusBadge>
                  ) : (
                    <StatusBadge tone="danger">Disabled</StatusBadge>
                  )}
                </TableCell>
                <TableCell wrap>
                  {user.roles.length === 0 ? (
                    <Text as="span" tone="secondary" className="italic">No roles</Text>
                  ) : (
                    <TableCellContent
                      primary={user.roles.filter((role) => !role.archived).map((role) => role.name).join(", ") || "—"}
                      secondary={
                        user.roles.some((role) => role.archived)
                          ? user.roles.filter((role) => role.archived).map((role) => `${role.name} (archived)`).join(", ")
                          : undefined
                      }
                    />
                  )}
                </TableCell>
                <TableCell align="end" stickyEnd><div className="flex items-center justify-end gap-2"><RowActionMenu label={`Actions for ${user.displayName}`} pending={pendingId === user.id} items={canManage ? [
 {label:"Edit",onSelect:()=>setEditTarget(user)}, {label:"Password",onSelect:()=>setPasswordTarget(user)},
 user.status === "ACTIVE" ? {label:"Disable",danger:true,separatorBefore:true,onSelect:()=>setConfirmDisable(user)} : {label:"Restore",onSelect:()=>runRowAction(user.id,()=>restoreUserAction(user.id))}
 ] : []} />{canAssignRoles && roles.length > 0 ? (
                      <RoleAssignControl
                        user={user}
                        roles={roles.filter((role) => !user.roles.some((assigned) => assigned.id === role.id))}
                        pending={pendingId === user.id}
                        onAssign={(roleId) =>
                          runRowAction(user.id, () => assignRoleAction(user.id, roleId))
                        }
                        onRemove={(roleId) => {
                          const role = user.roles.find((assigned) => assigned.id === roleId);
                          if (role) setConfirmRemoveRole({ user, roleId, roleName: role.name });
                        }}
                      />
                    ) : null}</div></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </DataTable>
      )}

      {/* Create */}
      <DraftDialog pending={createPending}
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="New user"
        description="Invite a platform account with initial credentials."
      >
        <form action={createAction}>
          <Field id="create-email" label="Email">
            <Input id="create-email" name="email" type="email" required autoComplete="off" />
          </Field>
          <Field id="create-display-name" label="Display name">
            <Input id="create-display-name" name="displayName" required />
          </Field>
          <Field id="create-password" label="Initial password" description="12–128 characters. The user should change it after signing in.">
            <Input id="create-password" name="password" type="password" required autoComplete="new-password" />
          </Field>
          <Field id="create-roles" label="Roles">
            <Select id="create-roles" name="roleIds" multiple size={Math.min(4, Math.max(2, roles.length))}>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </Select>
          </Field>
          {createState && !createState.ok ? (
            <InlineError>{createState.error.safeMessage}</InlineError>
          ) : null}
          <FormActions>
            <Button data-dialog-cancel type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" pending={createPending}>
              {createPending ? <Spinner aria-hidden="true" /> : null}
              <span>Create user</span>
            </Button>
          </FormActions>
        </form>
      </DraftDialog>

      {/* Edit display name */}
      <DraftDialog pending={editPending} open={editTarget !== null} onOpenChange={() => setEditTarget(null)} title="Edit user" size="sm">
        {editTarget ? (
          <form
            action={(formData) => {
              formData.set("userId", editTarget.id);
              editAction(formData);
            }}
          >
            <Field id="edit-display-name" label="Display name">
              <Input id="edit-display-name" name="displayName" defaultValue={editTarget.displayName} required />
            </Field>
            {editState && !editState.ok ? <InlineError>{editState.error.safeMessage}</InlineError> : null}
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

      {/* Set password */}
      <DraftDialog pending={passwordPending} open={passwordTarget !== null} onOpenChange={() => setPasswordTarget(null)} title="Set password" description="Revokes every active session of this user." size="sm">
        {passwordTarget ? (
          <form
            action={(formData) => {
              formData.set("userId", passwordTarget.id);
              passwordAction(formData);
            }}
          >
            <input type="hidden" name="userId" value={passwordTarget.id} />
            <Field id="set-password" label="New password" description="12–128 characters.">
              <Input id="set-password" name="password" type="password" required autoComplete="new-password" />
            </Field>
            {passwordState && !passwordState.ok ? <InlineError>{passwordState.error.safeMessage}</InlineError> : null}
            <FormActions>
              <Button type="button" variant="ghost" onClick={() => setPasswordTarget(null)}>
                Close
              </Button>
              <Button type="submit" variant="primary" pending={passwordPending}>
                {passwordPending ? <Spinner aria-hidden="true" /> : null}
                <span>Set password</span>
              </Button>
            </FormActions>
          </form>
        ) : null}
      </DraftDialog>

      {/* Disable confirmation */}
      <ConfirmDialog error={rowError} pending={pendingId !== null}
        open={confirmDisable !== null}
        onOpenChange={() => setConfirmDisable(null)}
        title={`Disable ${confirmDisable?.displayName ?? "user"}?`}
        description="The user signs out immediately and can no longer authenticate. Restore later to re-enable."
        confirmLabel="Disable user"
        tone="danger"
        onConfirm={() => {
          const target = confirmDisable;
          setConfirmDisable(null);
          if (target) runRowAction(target.id, () => disableUserAction(target.id));
        }}
      />

      {/* Role removal confirmation */}
      <ConfirmDialog error={rowError} pending={pendingId !== null}
        open={confirmRemoveRole !== null}
        onOpenChange={() => setConfirmRemoveRole(null)}
        title={`Remove ${confirmRemoveRole?.roleName ?? "role"} from ${confirmRemoveRole?.user.displayName ?? "user"}?`}
        description="The user loses this role's grants immediately. Last-administrator protection still applies."
        confirmLabel="Remove role"
        tone="danger"
        onConfirm={() => {
          const target = confirmRemoveRole;
          setConfirmRemoveRole(null);
          if (target) runRowAction(target.user.id, () => removeRoleAction(target.user.id, target.roleId));
        }}
      />
    </DirectoryShell>
  );
}

function RoleAssignControl({
  user,
  roles,
  pending,
  onAssign,
  onRemove,
}: {
  user: UserRow;
  roles: RoleOption[];
  pending: boolean;
  onAssign: (roleId: string) => void;
  onRemove: (roleId: string) => void;
}) {
  const [roleId, setRoleId] = useState("");
  const assignable = roles[0];
  return (
    <>
      {assignable ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (roleId) onAssign(roleId);
            setRoleId("");
          }}
          className="inline-flex gap-1.5"
        >
          <Select
            aria-label={`Assign a role to ${user.displayName}`}
            value={roleId}
            onChange={(event) => setRoleId(event.target.value)}
            className="min-w-[130px]"
          >
            <option value="">Assign role…</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary" size="sm" disabled={!roleId || pending}>
            Assign
          </Button>
        </form>
      ) : null}
      {user.roles.filter((role) => !role.archived).map((role) => (
        <span key={role.id} className="inline-flex items-center gap-1 rounded-control border border-line px-2 py-1 text-xs">
          <span>{role.name}</span>
          <IconButton
            label={`Remove ${role.name} from ${user.displayName}`}
            title={`Remove ${role.name}`}
            icon={<>×</>}
            size="sm"
            className="!h-5 !w-5 !min-h-5 !border-0 !bg-transparent !p-0 !text-ink-secondary hover:!bg-transparent hover:!text-danger"
            disabled={pending}
            onClick={() => onRemove(role.id)}
          />
        </span>
      ))}
    </>
  );
}
