"use client";

import { useActionState, type ReactNode } from "react";
import type { ActionResult } from "@platform/core/actions";
import { InlineError } from "@/platform/ui_engine";

export function PromotionDecisionForm({ action, children }: {
  action: (data: FormData) => Promise<ActionResult<{ id: string }>>;
  children: ReactNode;
}) {
  const [result, submit, pending] = useActionState(async (_previous: ActionResult<{ id: string }> | null, data: FormData) => action(data), null);
  return <form action={submit} className="grid gap-2">
    {result && !result.ok ? <InlineError>{result.error.safeMessage}</InlineError> : null}
    <fieldset disabled={pending} className="grid gap-2">{children}</fieldset>
  </form>;
}
