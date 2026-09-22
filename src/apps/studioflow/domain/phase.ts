/**
 * Phase workflow as pure rules (contract §5, Phase Engine V2 contract §2/§4).
 *
 * Identity model (V2-E): `SfPhase.id` is the runtime identity. Name, prefix, seat,
 * order and parallelism come from the snapshot stored on the phase when the project
 * was created; nothing here derives behaviour from a phase's name.
 */

export type PhaseSeat = "designer" | "drafter";

export const PHASE_STATUSES = [
  "PENDING",
  "IN_PROGRESS",
  "ON_REVIEW_INTERNAL",
  "APPROVED_INTERNAL",
  "ON_REVIEW_CLIENT",
  "READY_FOR_NEXT",
  "COMPLETED",
] as const;
export type PhaseStatus = (typeof PHASE_STATUSES)[number];

/** Snapshot fields stored on each project phase — immutable after project creation. */
export type PhaseSnapshot = {
  nameSnapshot: string;
  prefixSnapshot: string;
  seatSnapshot: PhaseSeat;
};

/**
 * Fixed definition ids of the five pre-V2 phases, seeded/backfilled by migration
 * `20260920000000_sf_v2e_definition_migration`. Only these ids carry legacy
 * behaviour: the Supervision completion command and the known accent colours.
 * A custom phase never becomes one of them by name.
 */
export const LEGACY_PHASE_DEFINITION_IDS = {
  moodboard: "00000000-0000-4000-8000-000000000101",
  layout: "00000000-0000-4000-8000-000000000102",
  design3d: "00000000-0000-4000-8000-000000000103",
  cd: "00000000-0000-4000-8000-000000000104",
  supervision: "00000000-0000-4000-8000-000000000105",
} as const;

const LEGACY_ACCENT_DOT_CLASSES: Readonly<Record<string, string>> = {
  [LEGACY_PHASE_DEFINITION_IDS.moodboard]: "bg-[var(--ui-phase-moodboard)]",
  [LEGACY_PHASE_DEFINITION_IDS.layout]: "bg-[var(--ui-phase-layout)]",
  [LEGACY_PHASE_DEFINITION_IDS.design3d]: "bg-[var(--ui-phase-design-3d)]",
  [LEGACY_PHASE_DEFINITION_IDS.cd]: "bg-[var(--ui-phase-cd)]",
  [LEGACY_PHASE_DEFINITION_IDS.supervision]: "bg-[var(--ui-phase-supervision)]",
};

/** Accent for the known legacy definitions; every other phase uses the neutral fallback. */
export function phaseAccentDotClass(definitionId: string | null | undefined): string {
  return (definitionId ? LEGACY_ACCENT_DOT_CLASSES[definitionId] : undefined) ?? "bg-line-strong";
}

/** The only phase with the special "Finish supervision" completion (legacy behaviour). */
export function isLegacySupervisionDefinition(definitionId: string | null | undefined): boolean {
  return definitionId === LEGACY_PHASE_DEFINITION_IDS.supervision;
}

// ── Simplified display (RW-01, contract §5.3) ──────────────────────────────

export type PhaseDisplayGroup = "Not started" | "Working" | "In review" | "Approved" | "Done";
export type PhaseTone = "neutral" | "success" | "warning" | "danger";

const DISPLAY: Record<PhaseStatus, { label: string; group: PhaseDisplayGroup; tone: PhaseTone }> = {
  PENDING: { label: "Not started", group: "Not started", tone: "neutral" },
  IN_PROGRESS: { label: "Working", group: "Working", tone: "warning" },
  ON_REVIEW_INTERNAL: { label: "Internal review", group: "In review", tone: "warning" },
  APPROVED_INTERNAL: { label: "Ready to send", group: "In review", tone: "warning" },
  ON_REVIEW_CLIENT: { label: "With client", group: "In review", tone: "warning" },
  READY_FOR_NEXT: { label: "Approved", group: "Approved", tone: "success" },
  COMPLETED: { label: "Done", group: "Done", tone: "success" },
};

export function phaseStatusDisplay(status: PhaseStatus) {
  return DISPLAY[status];
}

// ── Policy ────────────────────────────────────────────────────────────────

export type PhaseState = { status: PhaseStatus; isLocked: boolean };

/** Content (activities, checklist) may change only on an unlocked, unfinished phase. */
export function isPhaseModifiable(phase: PhaseState): boolean {
  if (phase.isLocked) return false;
  return phase.status !== "READY_FOR_NEXT" && phase.status !== "COMPLETED";
}

export function isPhaseFinished(status: PhaseStatus): boolean {
  return status === "READY_FOR_NEXT" || status === "COMPLETED";
}

/** Sequential activation: the first phase and parallel phases start freely. */
export function canActivatePhase(
  phase: { orderIndex: number; allowParallel: boolean },
  previous: { status: PhaseStatus } | null,
): boolean {
  if (phase.allowParallel) return true;
  if (!previous) return true;
  return isPhaseFinished(previous.status);
}

const TRANSITIONS: Record<PhaseStatus, readonly PhaseStatus[]> = {
  PENDING: ["IN_PROGRESS", "READY_FOR_NEXT", "COMPLETED"],
  IN_PROGRESS: ["ON_REVIEW_INTERNAL", "ON_REVIEW_CLIENT", "READY_FOR_NEXT"],
  ON_REVIEW_INTERNAL: ["IN_PROGRESS", "APPROVED_INTERNAL", "ON_REVIEW_CLIENT"],
  APPROVED_INTERNAL: ["ON_REVIEW_CLIENT", "IN_PROGRESS"],
  ON_REVIEW_CLIENT: ["IN_PROGRESS", "READY_FOR_NEXT", "COMPLETED"],
  READY_FOR_NEXT: ["IN_PROGRESS"],
  COMPLETED: ["IN_PROGRESS"],
};

export function isValidPhaseTransition(from: PhaseStatus, to: PhaseStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

// ── Commands available in a state (drives buttons; the service re-checks) ─

export type PhaseCommand =
  | "activate"
  | "bypass"
  | "submitInternal"
  | "approveInternal"
  | "rejectInternal"
  | "submitClient"
  | "approveClient"
  | "rejectClient"
  | "reopen"
  | "completeSupervision";

export function availablePhaseCommands(phase: PhaseState & { legacySupervision?: boolean }): PhaseCommand[] {
  const commands: PhaseCommand[] = [];
  const { status, isLocked, legacySupervision = false } = phase;
  if (status === "PENDING") commands.push("activate", "bypass");
  if (!isLocked) {
    if (status === "IN_PROGRESS" && legacySupervision) commands.push("completeSupervision");
    else if (status === "IN_PROGRESS") commands.push("submitInternal", "submitClient");
    if (status === "ON_REVIEW_INTERNAL") commands.push("approveInternal", "rejectInternal", "submitClient");
    if (status === "APPROVED_INTERNAL") commands.push("submitClient");
    if (status === "ON_REVIEW_CLIENT") commands.push("approveClient", "rejectClient");
  }
  if (isLocked || status === "PENDING") commands.push("reopen");
  return commands;
}

export const PHASE_COMMAND_LABELS: Record<PhaseCommand, string> = {
  activate: "Start phase",
  bypass: "Skip phase",
  submitInternal: "Send for internal review",
  approveInternal: "Approve internally",
  rejectInternal: "Needs changes (internal)",
  submitClient: "Send to client",
  approveClient: "Client approved",
  rejectClient: "Client asked for changes",
  reopen: "Reopen phase",
  completeSupervision: "Finish supervision",
};

// ── Revisions ────────────────────────────────────────────────────────────

export type RevisionNumber = { major: number; minor: number };

export function revisionLabel(revision: RevisionNumber, prefix = "v"): string {
  return `${prefix}${revision.major}.${revision.minor}`;
}

/** CLIENT feedback opens a new major revision; INTERNAL feedback a new minor. */
export function nextRevision(current: RevisionNumber | null, intent: "INTERNAL" | "CLIENT"): RevisionNumber {
  // A phase without any revision always starts at v1.0 (never v0.x).
  if (!current) return { major: 1, minor: 0 };
  const major = current.major;
  const minor = current.minor;
  return intent === "CLIENT" ? { major: major + 1, minor: 0 } : { major, minor: minor + 1 };
}

/** Whole days since `since` (floored, never negative); null when unknown. */
export function waitingDays(since: Date | null, now: Date = new Date()): number | null {
  if (!since) return null;
  return Math.max(0, Math.floor((now.getTime() - since.getTime()) / 86_400_000));
}
