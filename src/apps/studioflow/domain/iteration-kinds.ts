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

export function isCdMall(kinds: readonly string[], name: string): boolean {
  return kinds.length >= 2 && kinds[0] === name;
}

export function iterationChoices(input: { state: string; phaseStatus: string; iterationName: string; kinds: readonly string[]; supervision: boolean }): string[] {
  if (input.phaseStatus === "DONE") return ["add_iteration"];
  if (input.state === "NOT_SENT") return ["send"];
  if (input.state === "SENT") return ["record_answer"];
  if (input.state !== "ANSWERED") return [];
  if (input.supervision) return ["next_visit", "done"];
  return isCdMall(input.kinds, input.iterationName) ? ["revision", "continue_cd_final"] : ["revision", "done"];
}
