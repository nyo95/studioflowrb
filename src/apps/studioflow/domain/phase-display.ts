export type PhaseStepState = "done" | "current" | "waiting" | "attention" | "upcoming" | "blocked";

type IterationState = "NOT_SENT" | "SENT" | "ANSWERED" | "REVISED" | "DONE";

export function roundDisplayName(phaseName: string, iterationName: string): string {
  const match = /^(.*) (\d+)$/.exec(iterationName);
  return match && match[1] === phaseName ? `Round ${match[2]}` : iterationName;
}

export function phaseStepPresentation(input: {
  phaseName: string;
  phaseStatus: "PENDING" | "ACTIVE" | "DONE";
  previousPhaseName?: string | null;
  canStart: boolean;
  isSupervision: boolean;
  iterationCount?: number;
  iteration: { name: string; state: IterationState; waitingDays: number | null } | null;
}): { state: PhaseStepState; note: string } {
  if (input.phaseStatus === "DONE") {
    return {
      state: "done",
      note: input.iterationCount && input.iterationCount > 1 ? `Done in ${input.iterationCount} rounds` : "Done",
    };
  }
  if (input.phaseStatus === "PENDING") {
    return {
      state: "upcoming",
      note: input.canStart || !input.previousPhaseName ? "Not started" : `Starts after ${input.previousPhaseName}`,
    };
  }
  const iteration = input.iteration;
  if (!iteration) return { state: "current", note: "In progress" };
  const round = roundDisplayName(input.phaseName, iteration.name);
  if (iteration.state === "SENT") {
    const wait = iteration.waitingDays === null || iteration.waitingDays <= 0 ? "today" : `${iteration.waitingDays}d`;
    return { state: "waiting", note: `${round} · with client ${wait}` };
  }
  if (iteration.state === "ANSWERED") return { state: "attention", note: `${round} · client answered` };
  if (input.isSupervision && iteration.state === "NOT_SENT") return { state: "current", note: "Visit planned" };
  return { state: "current", note: `${round} · in progress` };
}
