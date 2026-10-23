"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  Button,
  ConfirmDialog,
  InlineError,
  SectionCard,
  StatusBadge,
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
  const optional = modules.filter((module) => module.kind === "optional");
  const core = modules.filter((module) => module.kind === "core");

  const change = (module: ModuleRow, state: "ENABLED" | "DISABLED") => {
    setError(null);
    startTransition(async () => {
      const result = await changeDeveloperModuleStateAction(module.id, state);
      if (!result.ok) setError(result.error.safeMessage);
      else { setDisableTarget(null); router.refresh(); }
    });
  };

  return (
    <SectionCard id="modules" className="scroll-mt-4" title="Modules" count={optional.length} description="Turn optional features on or off for everyone." padded={false}>
      <div className="border-b border-line-subtle px-(--ui-section-px) py-3 text-sm text-ink-secondary">
        Turning a module off hides it. Its data and role settings return when you turn it on again.
      </div>
      {error ? <div className="px-(--ui-section-px) pt-3"><InlineError>{error}</InlineError></div> : null}
      <ul className="divide-y divide-line-subtle">
        {optional.map((module) => (
          <li key={module.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-(--ui-section-px) py-3">
            <div className="min-w-0 flex-1 basis-40">
              <div className="font-medium text-ink">{module.name}</div>
              <div className="text-xs text-ink-tertiary">Version {module.version}</div>
            </div>
            <StatusBadge tone={module.state === "ENABLED" ? "success" : "neutral"}>{module.state === "ENABLED" ? "On" : "Off"}</StatusBadge>
            <div className="ml-auto min-w-21 text-right">
              {module.state === "ENABLED" ? (
                <Button type="button" variant="secondary" disabled={pending} onClick={() => setDisableTarget(module)}>Turn off</Button>
              ) : (
                <Button type="button" variant="primary" disabled={pending} onClick={() => change(module, "ENABLED")}>Turn on</Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <details className="border-t border-line-subtle px-(--ui-section-px) py-3 text-sm">
        <summary className="cursor-pointer font-medium text-ink-secondary hover:text-ink">Core applications · always on ({core.length})</summary>
        <ul className="mt-3 divide-y divide-line-subtle border-t border-line-subtle">
          {core.map((module) => (
            <li key={module.id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="font-medium text-ink">{module.name}</span>
              <span className="text-xs text-ink-tertiary">Version {module.version}</span>
            </li>
          ))}
        </ul>
      </details>
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
