"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public/nav";
import {
  Button,
  DataTable,
  DraftDialog,
  EmptyState,
  EntityPrimaryCell,
  Field,
  FilterChip,
  FormActions,
  InlineError,
  Input,
  RowActionMenu,
  RowActionsCell,
  RowActionsHead,
  SearchField,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  Textarea,
} from "@/platform/ui_engine";

import { saveClientAction, setClientArchivedAction } from "../actions";
import { useCommand } from "../_components/use-command";

type Client = { id: string; name: string; address: string | null; archivedAt: Date | null; activeProjects: number; totalProjects: number };

export function ClientDirectory({ clients, canManage }: { clients: Client[]; canManage: boolean }) {
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Client | "new" | null>(null);
  const { run, pendingKey, error } = useCommand();
  const rows = clients.filter((c) => (showArchived ? c.archivedAt !== null : c.archivedAt === null) && c.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="grid gap-3">
      <TableToolbar
        search={<SearchField value={query} onChange={(e) => setQuery(e.target.value)} onClear={() => setQuery("")} placeholder="Search clients…" />}
        filters={<FilterChip selected={showArchived} onClick={() => setShowArchived(!showArchived)}>Archived</FilterChip>}
        actions={canManage ? <Button variant="primary" leadingIcon={<Plus aria-hidden="true" />} onClick={() => setEditing("new")}>New client</Button> : undefined}
      />
      {error && editing === null ? <InlineError>{error}</InlineError> : null}
      <DataTable minWidth={640}>
        <TableHeader>
          <TableRow>
            <TableHead>Client</TableHead>
            <TableHead align="end">Running projects</TableHead>
            <TableHead align="end">All projects</TableHead>
            {canManage ? <RowActionsHead /> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow><TableCell colSpan={canManage ? 4 : 3}><EmptyState title={showArchived ? "No archived clients" : "No clients yet"} /></TableCell></TableRow>
          ) : rows.map((client) => (
            <TableRow key={client.id}>
              <TableCell>
                <Link href={STUDIOFLOW_ROUTES.client(client.id)} prefetch={false} className="block no-underline hover:underline">
                  <EntityPrimaryCell tone={client.archivedAt ? "neutral" : "success"} statusLabel={client.archivedAt ? "Archived" : "Active"} name={client.name} secondary={client.address ?? undefined} />
                </Link>
              </TableCell>
              <TableCell align="end">{client.activeProjects}</TableCell>
              <TableCell align="end">{client.totalProjects}</TableCell>
              {canManage ? (
                <RowActionsCell>
                  <RowActionMenu pending={pendingKey === client.id} items={[
                    { label: "Edit", onSelect: () => setEditing(client) },
                    client.archivedAt
                      ? { label: "Restore", onSelect: () => run(client.id, () => setClientArchivedAction(client.id, false)) }
                      : { label: "Archive", danger: true, disabled: client.activeProjects > 0, onSelect: () => run(client.id, () => setClientArchivedAction(client.id, true)) },
                  ]} />
                </RowActionsCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </DataTable>
      {editing ? <ClientDialog key={editing === "new" ? "new" : editing.id} client={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

export function ClientDialog({ client, onClose }: { client: { id: string; name: string; address: string | null } | null; onClose: () => void }) {
  const { run, pending, error } = useCommand();
  const [name, setName] = useState(client?.name ?? "");
  const [address, setAddress] = useState(client?.address ?? "");
  return (
    <DraftDialog open onOpenChange={(open) => { if (!open) onClose(); }} title={client ? "Edit client" : "New client"} pending={pending}>
      <form className="grid gap-3" onSubmit={async (e) => {
        e.preventDefault();
        if (await run("save", () => saveClientAction({ clientId: client?.id, name, address: address || null }))) onClose();
      }}>
        <Field label="Name" required><Input autoFocus value={name} maxLength={200} name="name" onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Address"><Textarea rows={2} value={address} name="address" onChange={(e) => setAddress(e.target.value)} /></Field>
        {error ? <InlineError>{error}</InlineError> : null}
        <FormActions>
          <Button type="button" data-dialog-cancel disabled={pending}>Cancel</Button>
          <Button type="submit" variant="primary" pending={pending} disabled={!name.trim()}>Save</Button>
        </FormActions>
      </form>
    </DraftDialog>
  );
}
