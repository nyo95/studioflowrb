"use client";

import { Button, InlineError } from "@/platform/ui_engine";

import { projectCompletionAction } from "../actions";
import { useCommand } from "./use-command";

/** The one way out of a completed project's read-only state. */
export function ReopenProjectButton({ projectId }: { projectId: string }) {
  const { run, pending, error } = useCommand();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button size="sm" pending={pending} onClick={() => void run("reopen", () => projectCompletionAction(projectId, "reopen"))}>Reopen project</Button>
      {error ? <InlineError>{error}</InlineError> : null}
    </span>
  );
}
