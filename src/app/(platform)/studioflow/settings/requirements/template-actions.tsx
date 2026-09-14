"use client";

import { useActionState } from "react";
import type { ActionResult } from "@platform/core/actions";
import { Button, InlineError } from "@/platform/ui_engine";
import { archiveRequirementTemplateAction, deleteRequirementTemplateAction, restoreRequirementTemplateAction } from "./actions";

const INITIAL: ActionResult<void> | null = null;

export function RequirementTemplateActions({ templateId, archived, canDelete }: { templateId: string; archived: boolean; canDelete: boolean }) {
  const [state, action, pending] = useActionState(async (_prev: ActionResult<void> | null, _formData: FormData) => {
    return archived ? restoreRequirementTemplateAction(templateId) : archiveRequirementTemplateAction(templateId);
  }, INITIAL);
  const [deleteState, deleteAction, deletePending] = useActionState(async (_prev: ActionResult<void> | null, _formData: FormData) => deleteRequirementTemplateAction(templateId), INITIAL);
  const failure = state?.ok === false ? state.error.safeMessage : deleteState?.ok === false ? deleteState.error.safeMessage : null;

  return (
    <div className="grid justify-items-end gap-2">
      {failure ? <InlineError>{failure}</InlineError> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <form action={action}><Button type="submit" variant="secondary" pending={pending}>{archived ? "Restore" : "Archive"}</Button></form>
        {archived && canDelete ? <form action={deleteAction}><Button type="submit" variant="danger" pending={deletePending}>Delete</Button></form> : null}
      </div>
    </div>
  );
}
