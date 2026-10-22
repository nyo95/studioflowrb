"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  Button,
  DataTable,
  InlineError,
  Notice,
  SectionCard,
  Select,
  TableBody,
  TableCell,
  TableCellContent,
  TableHead,
  TableHeader,
  TableRow,
} from "@/platform/ui_engine";

import { changeIntegrationAccessAction } from "./actions";

type AllowedUser = { userId: string; displayName: string; email: string };
type GatedModule = { moduleId: string; name: string; allowed: readonly AllowedUser[] };
type Candidate = { id: string; displayName: string; email: string };

export function DeveloperIntegrationAccess({ modules, users }: { modules: readonly GatedModule[]; users: readonly Candidate[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});

  const change = (moduleId: string, userId: string, allowed: boolean) => {
    setError(null);
    startTransition(async () => {
      const result = await changeIntegrationAccessAction(moduleId, userId, allowed);
      if (!result.ok) setError(result.error.safeMessage);
      else { setPicked((current) => ({ ...current, [moduleId]: "" })); router.refresh(); }
    });
  };

  return (
    <SectionCard title="AI and plugin access" description="Who may connect an AI assistant or a companion plugin. This list is not part of Roles: no role, not even the Platform Owner, gets it automatically." padded={false}>
      <div className="grid gap-3 p-(--ui-section-px)">
        <Notice title="Still only what the person may do by hand.">
          A listed person acts as themselves, with their own role and project access. The list only opens the door; it adds no permission.
        </Notice>
        {error ? <InlineError>{error}</InlineError> : null}
      </div>
      {modules.map((module) => {
        const free = users.filter((user) => !module.allowed.some((entry) => entry.userId === user.id));
        const choice = picked[module.moduleId] ?? "";
        return (
          <div key={module.moduleId} className="grid gap-2 border-t border-(--ui-border) pb-3">
            <div className="flex flex-wrap items-center gap-2 px-(--ui-section-px) pt-3">
              <span className="font-medium">{module.name}</span>
              <span className="grow" />
              <Select aria-label={`Allow a person to use ${module.name}`} value={choice} onChange={(event) => setPicked((current) => ({ ...current, [module.moduleId]: event.target.value }))}>
                <option value="">Choose a person…</option>
                {free.map((user) => <option key={user.id} value={user.id}>{user.displayName} · {user.email}</option>)}
              </Select>
              <Button type="button" variant="primary" disabled={pending || !choice} onClick={() => change(module.moduleId, choice, true)}>Allow</Button>
            </div>
            <DataTable framed={false} density="compact">
              <TableHeader>
                <TableRow>
                  <TableHead>Allowed person</TableHead>
                  <TableHead align="end">Control</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {module.allowed.length === 0 ? (
                  <TableRow><TableCell colSpan={2}>Nobody is allowed yet.</TableCell></TableRow>
                ) : module.allowed.map((entry) => (
                  <TableRow key={entry.userId}>
                    <TableCell><TableCellContent primary={entry.displayName} secondary={entry.email} /></TableCell>
                    <TableCell align="end"><Button type="button" variant="secondary" disabled={pending} onClick={() => change(module.moduleId, entry.userId, false)}>Remove</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </DataTable>
          </div>
        );
      })}
    </SectionCard>
  );
}
