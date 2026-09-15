import { StatusBadge } from "@/platform/ui_engine";
import { phaseStatusDisplay, type PhaseStatus } from "@/apps/studioflow/domain/phase";

export function PhaseStatusBadge({ status, waitingDays }: { status: PhaseStatus; waitingDays?: number | null }) {
  const display = phaseStatusDisplay(status);
  const suffix = waitingDays !== undefined && waitingDays !== null && waitingDays > 0 ? ` · ${waitingDays}d` : "";
  return (
    <StatusBadge tone={display.tone} title={waitingDays ? `In this state for ${waitingDays} day(s)` : undefined}>
      {display.label}
      {suffix}
    </StatusBadge>
  );
}

export const PRIORITY_LABEL = { URGENT: "Urgent", NORMAL: "Normal", LOW: "Low" } as const;
export const PROJECT_STATUS_LABEL = { ACTIVE: "Active", ON_HOLD: "On hold", COMPLETED: "Completed" } as const;
export const PROJECT_STATUS_TONE = { ACTIVE: "success", ON_HOLD: "warning", COMPLETED: "neutral" } as const;
