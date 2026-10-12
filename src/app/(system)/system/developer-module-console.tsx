"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  Button,
  ConfirmDialog,
  DataTable,
  InlineError,
  Notice,
  SectionCard,
  StatusBadge,
  TableBody,
  TableCell,
  TableCellContent,
  TableHead,
  TableHeader,
  TableRow,
} from "@/platform/ui_engine";

import { changeDeveloperModuleStateAction } from "./actions";

type ModuleRow = {
  id: string;
  name: string;
  version: string;
  kind: "core" | "optional";
  state: "ENABLED" | "DISABLED";
  lastVersion: string;
};

export function DeveloperModuleConsole({ modules }: { modules: readonly ModuleRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [disableTarget, setDisableTarget] = useState<ModuleRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const change = (module: ModuleRow, state: "ENABLED" | "DISABLED") => {
    setError(null);
    startTransition(async () => {
      const result = await changeDeveloperModuleStateAction(module.id, state);
      if (!result.ok) setError(result.error.safeMessage);
      else { setDisableTarget(null); router.refresh(); }
    });
  };

  return (
    <SectionCard title="Installed modules" description="Only optional modules can be changed here." padded={false}>
      <div className="grid gap-3 p-(--ui-section-px)">
        <Notice title="Business data is preserved.">
          Turning a module off hides it for everyone and pauses its access. Turning it on restores the same data and stored role grants.
        </Notice>
        {error ? <InlineError>{error}</InlineError> : null}
      </div>
      <DataTable framed={false} density="compact">
        <TableHeader>
          <TableRow>
            <TableHead>Module</TableHead>
            <TableHead>Version</TableHead>
            <TableHead>Status</TableHead>
            <TableHead align="end">Control</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {modules.map((module) => (
            <TableRow key={module.id}>
              <TableCell>
                <TableCellContent
                  primary={module.name}
                  secondary={module.kind === "core" ? "Core bundle, always on" : "Optional module"}
                />
              </TableCell>
              <TableCell>{module.version}</TableCell>
              <TableCell><StatusBadge tone={module.state === "ENABLED" ? "success" : "neutral"}>{module.state === "ENABLED" ? "On" : "Off"}</StatusBadge></TableCell>
              <TableCell align="end">
                {module.kind === "core" ? (
                  <Button type="button" variant="ghost" disabled>Always on</Button>
                ) : module.state === "ENABLED" ? (
                  <Button type="button" variant="secondary" disabled={pending} onClick={() => setDisableTarget(module)}>Turn off</Button>
                ) : (
                  <Button type="button" variant="primary" disabled={pending} onClick={() => change(module, "ENABLED")}>Turn on</Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </DataTable>
      <ConfirmDialog
        open={disableTarget !== null}
        onOpenChange={(open) => { if (!open && !pending) setDisableTarget(null); }}
        title={`Turn off ${disableTarget?.name ?? "module"}?`}
        description="It will disappear for everyone. Existing data and role selections are kept and return when the module is turned on again."
        confirmLabel="Turn off"
        tone="danger"
        pending={pending}
        error={error}
        onConfirm={() => { if (disableTarget) change(disableTarget, "DISABLED"); }}
      />
    </SectionCard>
  );
}
