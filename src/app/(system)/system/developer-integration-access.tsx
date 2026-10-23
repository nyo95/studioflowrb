"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  Button,
  InlineError,
  SectionCard,
  Select,
  StatusBadge,
} from "@/platform/ui_engine";

import { changeIntegrationAccessAction } from "./actions";

type AllowedUser = { userId: string; displayName: string; email: string };
type GatedModule = { moduleId: string; name: string; enabled: boolean; allowed: readonly AllowedUser[] };
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
    <SectionCard id="integration-access" className="scroll-mt-4" title="AI & plugin access" count={modules.length} description="Choose which people may connect each tool." padded={false}>
      <div className="border-b border-line-subtle px-(--ui-section-px) py-3 text-sm text-ink-secondary">
        Access here is separate from Roles. Each person still uses their own project permissions.
      </div>
      {error ? <div className="px-(--ui-section-px) pt-3"><InlineError>{error}</InlineError></div> : null}
      {modules.map((module) => {
        const free = users.filter((user) => !module.allowed.some((entry) => entry.userId === user.id));
        const choice = picked[module.moduleId] ?? "";
        return (
          <div key={module.moduleId} className="border-b border-line-subtle px-(--ui-section-px) py-4 last:border-b-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h4 className="font-semibold text-ink">{module.name}</h4>
              <StatusBadge tone={module.enabled ? "success" : "neutral"}>{module.enabled ? "Module on" : "Module off"}</StatusBadge>
              <span className="text-xs text-ink-tertiary">{module.allowed.length} allowed</span>
            </div>
            {!module.enabled ? <p className="mt-1 text-sm text-ink-secondary">Access will take effect when this module is turned on.</p> : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Select className="min-w-0 flex-1 basis-52" aria-label={`Allow a person to use ${module.name}`} value={choice} onChange={(event) => setPicked((current) => ({ ...current, [module.moduleId]: event.target.value }))}>
                <option value="">Choose a person…</option>
                {free.map((user) => <option key={user.id} value={user.id}>{user.displayName} · {user.email}</option>)}
              </Select>
              <Button type="button" variant="primary" disabled={pending || !choice} onClick={() => change(module.moduleId, choice, true)}>Allow</Button>
            </div>
            <div className="mt-4 border-t border-line-subtle pt-2">
              <div className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">Allowed people</div>
              {module.allowed.length === 0 ? (
                <p className="py-3 text-sm text-ink-secondary">Nobody is allowed yet.</p>
              ) : (
                <ul className="mt-1 divide-y divide-line-subtle">
                  {module.allowed.map((entry) => (
                    <li key={entry.userId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                      <div className="min-w-0 flex-1 basis-44">
                        <div className="font-medium text-ink">{entry.displayName}</div>
                        <div className="break-all text-xs text-ink-secondary">{entry.email}</div>
                      </div>
                      <Button type="button" variant="secondary" disabled={pending} onClick={() => change(module.moduleId, entry.userId, false)}>Remove</Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        );
      })}
    </SectionCard>
  );
}
