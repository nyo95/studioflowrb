"use client";

import { useActionState, useState } from "react";

import {
  Button,
  CopyButton,
  DataTable,
  EmptyState,
  Field,
  FormActions,
  InlineError,
  Input,
  Notice,
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
} from "@/platform/ui_engine";
import type { ActionResult } from "@platform/core/actions";
import { createIntegrationTokenAction, revokeIntegrationTokenAction } from "./actions";

export type TokenRow = {
  id: string;
  label: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  status: "active" | "revoked" | "expired";
};
export type ScopeOption = { scope: string; label: string };
type Created = Awaited<ReturnType<typeof createIntegrationTokenAction>>;

export function IntegrationTokens({ tokens, scopes }: { tokens: TokenRow[]; scopes: ScopeOption[] }) {
  const [created, createAction, creating] = useActionState<Created | null, FormData>(createIntegrationTokenAction, null);
  const [revoked, revokeAction, revoking] = useActionState(
    async (_prev: ActionResult<{ revoked: true }> | null, formData: FormData) => revokeIntegrationTokenAction(String(formData.get("tokenId") ?? "")),
    null,
  );
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const labelOf = (scope: string) => scopes.find((option) => option.scope === scope)?.label ?? scope;

  return (
    <div className="grid gap-4">
      {created?.ok ? (
        <div role="status">
          <Notice tone="success" title={`Token "${created.data.token.label}" created`}>
            <p className="mb-2">Copy it now. It is shown only once and cannot be recovered; if you lose it, create a new one.</p>
            <div className="flex items-center gap-2">
              <code className="break-all text-sm">{created.data.secret}</code>
              <CopyButton value={created.data.secret} label="Copy token" />
            </div>
          </Notice>
        </div>
      ) : null}

      <SectionCard>
        <form action={createAction} className="grid gap-3">
          <Field id="token-label" label="Name" description="What this token is for, for example SketchUp on the office PC.">
            <Input id="token-label" name="label" maxLength={120} required />
          </Field>
          <Field id="token-scopes" label="Allowed to">
            <div className="grid gap-1">
              {scopes.map((option) => (
                <label key={option.scope} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="scopes" value={option.scope} defaultChecked={scopes.length === 1} />
                  {option.label}
                </label>
              ))}
            </div>
          </Field>
          <Field id="token-expiry" label="Valid for">
            <Select id="token-expiry" name="expiry" defaultValue="90">
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">1 year</option>
              <option value="never">No expiry</option>
            </Select>
          </Field>
          {created?.ok === false ? (
            <div role="alert">
              <InlineError>{created.error.safeMessage}</InlineError>
            </div>
          ) : null}
          <FormActions>
            <Button type="submit" variant="primary" disabled={creating}>
              {creating ? <Spinner aria-hidden="true" /> : null}
              <span>{creating ? "Creating…" : "Create token"}</span>
            </Button>
          </FormActions>
        </form>
      </SectionCard>

      {revoked?.ok === false ? (
        <div role="alert">
          <InlineError>{revoked.error.safeMessage}</InlineError>
        </div>
      ) : null}
      {tokens.length === 0 ? (
        <EmptyState title="No tokens yet" description="A token lets an outside tool, such as the SketchUp plugin, act as you." />
      ) : (
        <DataTable density="compact" minWidth={720}>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Allowed to</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Status</TableHead>
              <TableHead align="end">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tokens.map((token) => (
              <TableRow key={token.id}>
                <TableCell wrap>
                  <TableCellContent primary={token.label} secondary={`sfk_${token.prefix}…`} />
                </TableCell>
                <TableCell wrap>{token.scopes.map(labelOf).join(", ")}</TableCell>
                <TableCell>{token.lastUsedAt ?? "Never"}</TableCell>
                <TableCell>{token.expiresAt ?? "Never"}</TableCell>
                <TableCell>
                  {token.status === "active" ? (
                    <StatusBadge tone="success">Active</StatusBadge>
                  ) : token.status === "expired" ? (
                    <StatusBadge tone="neutral">Expired</StatusBadge>
                  ) : (
                    <StatusBadge tone="danger">Revoked</StatusBadge>
                  )}
                </TableCell>
                <TableCell align="end">
                  {token.status === "active" ? (
                    <form action={revokeAction} onSubmit={() => setRevokingId(token.id)} className="inline-flex">
                      <input type="hidden" name="tokenId" value={token.id} />
                      <Button type="submit" variant="secondary" size="sm" disabled={revoking} pending={revoking && revokingId === token.id}>
                        Revoke
                      </Button>
                    </form>
                  ) : (
                    <span aria-hidden="true">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </DataTable>
      )}
    </div>
  );
}
