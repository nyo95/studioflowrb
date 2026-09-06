"use client";

import { useActionState, useState } from "react";

import {
  Button,
  DataTable,
  EmptyState,
  InlineError,
  StatusBadge,
  TableBody,
  TableCell,
  TableCellContent,
  TableHead,
  TableHeader,
  TableRow,
} from "@/platform/ui_engine";
import type { ActionResult } from "@platform/core/actions";
import { revokeSessionAction } from "./actions";

const INITIAL: ActionResult<{ revoked: boolean }> | null = null;

export type SessionRow = {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revoked: boolean;
  userAgent: string | null;
};

export function SessionsTable({
  sessions,
  currentSessionId,
  onLogoutAll,
}: {
  sessions: SessionRow[];
  currentSessionId: string | null;
  onLogoutAll: () => Promise<void>;
}) {
  const [state, action, pending] = useActionState(
    async (_prev: ActionResult<{ revoked: boolean }> | null, formData: FormData) =>
      revokeSessionAction(String(formData.get("sessionId") ?? "")),
    INITIAL,
  );
  const [revokingId, setRevokingId] = useState<string | null>(null);

  if (sessions.length === 0) {
    return <EmptyState title="No sessions" description="Sessions appear here when you sign in." />;
  }

  return (
    <div>
      {state && !state.ok ? (
        <div role="alert" className="mb-2">
          <InlineError>{state.error.safeMessage}</InlineError>
        </div>
      ) : null}
      <DataTable density="compact" stickyHeader maxBodyHeight="60vh" minWidth={720}>
        <TableHeader>
          <TableRow>
            <TableHead>Started</TableHead>
            <TableHead>Last seen</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead>Device</TableHead>
            <TableHead>Status</TableHead>
            <TableHead align="end">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.map((session) => {
            const isCurrent = session.id === currentSessionId;
            return (
              <TableRow key={session.id}>
                <TableCell>{session.createdAt}</TableCell>
                <TableCell>{session.lastSeenAt}</TableCell>
                <TableCell>{session.expiresAt}</TableCell>
                <TableCell wrap>
                  <TableCellContent
                    primary={isCurrent ? "This browser" : "Other device"}
                    secondary={session.userAgent ?? undefined}
                  />
                </TableCell>
                <TableCell>
                  {session.revoked ? (
                    <StatusBadge tone="danger">Revoked</StatusBadge>
                  ) : isCurrent ? (
                    <StatusBadge tone="success">Current</StatusBadge>
                  ) : (
                    <StatusBadge tone="neutral">Active</StatusBadge>
                  )}
                </TableCell>
                <TableCell align="end">
                  {!session.revoked ? (
                    <form
                      action={action}
                      onSubmit={() => setRevokingId(session.id)}
                      className="inline-flex"
                    >
                      <input type="hidden" name="sessionId" value={session.id} />
                      <Button
                        type="submit"
                        variant="secondary"
                        size="sm"
                        disabled={pending} pending={pending && revokingId === session.id}
                      >
                        Revoke
                      </Button>
                    </form>
                  ) : (
                    <span aria-hidden="true">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </DataTable>
      <form action={onLogoutAll} className="mt-3">
        <Button type="submit" variant="secondary">
          Sign out all devices
        </Button>
      </form>
    </div>
  );
}
