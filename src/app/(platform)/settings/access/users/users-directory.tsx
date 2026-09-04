"use client";

import { useActionState, useState, useTransition } from "react";
import { UserPlus } from "lucide-react";

import {
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  EmptyState,
  Field,
  FormActions,
  InlineError,
  IconButton,
  Input,
  SectionCard,
  Select,
  Spinner,
  StatusBadge,
  TableBody,
  TableCell,
  TableCellContent,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  Text,
} from "@/platform/ui_engine";
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
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<UserRow | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<UserRow | null>(null);
  const [confirmDisable, setConfirmDisable] = useState<UserRow | null>(null);
  const [confirmRemoveRole, setConfirmRemoveRole] = useState<{ user: UserRow; roleId: string; roleName: string } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const [createState, createAction, createPending] = useActionState(createUserAction, null);
  const [editState, editAction, editPending] = useActionState(updateUserDisplayNameAction, null);
  const [passwordState, passwordAction, passwordPending] = useActionState(setUserPasswordAction, null);

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
      <TableToolbar actions={canManage ? (
        <Button type="button" variant="primary" onClick={() => setCreateOpen(true)}>
          <UserPlus aria-hidden="true" />
          <span>New user</span>
        </Button>
      ) : undefined} />

      {users.length === 0 ? (
        <EmptyState title="No users yet" description="Create the first platform account to get started." />
      ) : (
        <DataTable minWidth={860}>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Display name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead align="end">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
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
                <TableCell align="end">
                  <div className="inline-flex flex-wrap justify-end gap-1.5">
                    {canManage ? (
                      <>
                        <Button type="button" variant="secondary" size="sm" onClick={() => setEditTarget(user)}>
                          Edit
                        </Button>
                        <Button type="button" variant="secondary" size="sm" onClick={() => setPasswordTarget(user)}>
                          Password
                        </Button>
                      </>
                    ) : null}
                    {canAssignRoles && roles.length > 0 ? (
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
                    ) : null}
                    {canManage ? (
                      user.status === "ACTIVE" ? (
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          onClick={() => setConfirmDisable(user)}
                        >
                          Disable
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={pendingId === user.id}
                          onClick={() => runRowAction(user.id, () => restoreUserAction(user.id))}
                        >
                          {pendingId === user.id ? "Restoring…" : "Restore"}
                        </Button>
                      )
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </DataTable>
      )}

      {/* Create */}
      <Dialog
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
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={createPending}>
              {createPending ? <Spinner aria-hidden="true" /> : null}
              <span>Create user</span>
            </Button>
          </FormActions>
        </form>
      </Dialog>

      {/* Edit display name */}
      <Dialog open={editTarget !== null} onOpenChange={() => setEditTarget(null)} title="Edit user" size="sm">
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
              <Button type="submit" variant="primary" disabled={editPending}>
                {editPending ? <Spinner aria-hidden="true" /> : null}
                <span>Save</span>
              </Button>
            </FormActions>
          </form>
        ) : null}
      </Dialog>

      {/* Set password */}
      <Dialog open={passwordTarget !== null} onOpenChange={() => setPasswordTarget(null)} title="Set password" description="Revokes every active session of this user." size="sm">
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
              <Button type="submit" variant="primary" disabled={passwordPending}>
                {passwordPending ? <Spinner aria-hidden="true" /> : null}
                <span>Set password</span>
              </Button>
            </FormActions>
          </form>
        ) : null}
      </Dialog>

      {/* Disable confirmation */}
      <ConfirmDialog
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
      <ConfirmDialog
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
    </SectionCard>
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
