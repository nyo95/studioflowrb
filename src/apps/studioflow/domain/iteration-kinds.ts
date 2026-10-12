/** Stored phase-definition JSON is an array of `{ name }` records.  Accepting
 * strings too keeps older manually-configured definitions readable. */
export function iterationKinds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === "string") return entry.trim() ? [entry.trim()] : [];
    if (entry && typeof entry === "object" && "name" in entry && typeof entry.name === "string" && entry.name.trim()) return [entry.name.trim()];
    return [];
  });
}

/**
 * A phase whose definition lists two or more iteration kinds is a two-step phase (the studio's Construction Drawing:
 * CD Mall then CD Final; contract §5.2). Its first step must continue to the second before the phase can close. The
 * name says "CD Mall" for history; it applies to any two-step phase, e.g. "Concept Study" then "Final Concept".
 * Only the first two kinds are steps; later kinds are names offered for rounds and never change the workflow.
 */
export function isCdMall(kinds: readonly string[], name: string): boolean {
  return kinds.length >= 2 && kinds[0] === name;
}

/** The step a two-step phase's first step continues to ("CD Final"), or null when the round is not a first step. */
export function nextIterationKind(kinds: readonly string[], name: string): string | null {
  return isCdMall(kinds, name) ? kinds[1]! : null;
}

export function iterationChoices(input: { state: string; phaseStatus: string; iterationName: string; kinds: readonly string[]; supervision: boolean }): string[] {
  if (input.phaseStatus === "DONE") return ["add_iteration"];
  // A supervision visit is never sent to a client: the open visit is closed with "Next visit" or "Done (handover)".
  if (input.supervision) return input.state === "NOT_SENT" ? ["next_visit", "done"] : [];
  if (input.state === "NOT_SENT") return ["send"];
  if (input.state === "SENT") return ["record_answer"];
  if (input.state !== "ANSWERED") return [];
  return isCdMall(input.kinds, input.iterationName) ? ["revision", "continue_cd_final"] : ["revision", "done"];
}
