/**
 * Legacy phase workflow, ported as pure rules (contract §5).
 * Evidence: legacy `src/lib/domain/phase-policy.ts`, `phase-service.ts`,
 * project bootstrap in `project-service.ts` (pinned c4b0c466).
 *
 * V2 identity model:
 *   - `SfPhase.id` is the canonical runtime identity.
 *   - `definition_id`, `name_snapshot`, `prefix_snapshot`, `seat_snapshot`, `order_index`
 *     form the V2 business snapshot, immutable after project creation.
 *   - `key` (SfPhaseKey) is a temporary compatibility bridge until V2-E removes it.
 *     Do not use `key` for naming, assignment, revision prefix, or UI labels.
 */

export const PHASE_KEYS = ["MOODBOARD", "LAYOUT", "DESIGN_3D", "CD", "SUPERVISION"] as const;
export type PhaseKey = (typeof PHASE_KEYS)[number];

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

export type PhaseBlueprint = { key: PhaseKey; orderIndex: number; allowParallel: boolean; label: string };

/** V2 runtime identity — the canonical way to identify a phase at runtime. */
export type PhaseRuntimeIdentity = {
  id: string;
  definitionId: string | null;
  legacyKey: PhaseKey | null;
};

/** Snapshot fields stored on each project phase — immutable after project creation. */
export type PhaseSnapshot = {
  nameSnapshot: string;
  prefixSnapshot: string;
  seatSnapshot: "designer" | "drafter";
};

/** Default snapshot values for phases created from PHASE_BLUEPRINT (legacy compatibility). */
export const PHASE_BLUEPRINT_SNAPSHOTS: Record<PhaseKey, PhaseSnapshot> = {
  MOODBOARD: { nameSnapshot: "Moodboard", prefixSnapshot: "MB", seatSnapshot: "designer" },
  LAYOUT: { nameSnapshot: "Layout Plan", prefixSnapshot: "L", seatSnapshot: "designer" },
  DESIGN_3D: { nameSnapshot: "3D Design", prefixSnapshot: "3D", seatSnapshot: "designer" },
  CD: { nameSnapshot: "Construction Drawing", prefixSnapshot: "CD", seatSnapshot: "drafter" },
  SUPERVISION: { nameSnapshot: "Supervision", prefixSnapshot: "SV", seatSnapshot: "designer" },
};

/** Created for every project, in this order. Phase 1 starts IN_PROGRESS. */
export const PHASE_BLUEPRINT: readonly PhaseBlueprint[] = [
  { key: "MOODBOARD", orderIndex: 1, allowParallel: false, label: "Moodboard" },
  { key: "LAYOUT", orderIndex: 2, allowParallel: true, label: "Layout Plan" },
  { key: "DESIGN_3D", orderIndex: 3, allowParallel: true, label: "3D Design" },
  { key: "CD", orderIndex: 4, allowParallel: true, label: "Construction Drawing" },
  { key: "SUPERVISION", orderIndex: 5, allowParallel: false, label: "Supervision" },
];

export function phaseLabel(key: PhaseKey): string {
  return PHASE_BLUEPRINT.find((phase) => phase.key === key)?.label ?? key;
}

export const PHASE_ACCENT_DOT_CLASSES: Record<PhaseKey, string> = {
  MOODBOARD: "bg-[var(--ui-phase-moodboard)]",
  LAYOUT: "bg-[var(--ui-phase-layout)]",
  DESIGN_3D: "bg-[var(--ui-phase-design-3d)]",
  CD: "bg-[var(--ui-phase-cd)]",
  SUPERVISION: "bg-[var(--ui-phase-supervision)]",
};

export function phaseAccentDotClass(key: PhaseKey | null | undefined): string {
  return key ? PHASE_ACCENT_DOT_CLASSES[key] : "bg-line-strong";
}

/** CD is the drafter's phase; every other phase belongs to the designer (RW-02). */
export function phaseOwnerSeat(key: PhaseKey): "designer" | "drafter" {
  return key === "CD" ? "drafter" : "designer";
}

// ── V2 identity bridge ───────────────────────────────────────────────────

/** Isolates legacy Supervision-specific behavior behind one explicit check. V2-E bridge debt. */
export function isLegacySupervisionPhase(key: PhaseKey): boolean {
  return key === "SUPERVISION";
}

/** Label→key lookup for mapping template definitions to legacy SfPhaseKey. */
const LABEL_TO_KEY = new Map<string, PhaseKey>([
  ...PHASE_BLUEPRINT.map((bp) => [bp.label.toLowerCase(), bp.key]),
  // Migration seeds "Design 3D" while PHASE_BLUEPRINT uses "3D Design" — accept both.
  ["design 3d", "DESIGN_3D"],
]);

/**
 * Map a template definition name to a valid legacy SfPhaseKey.
 * Returns null if the definition name has no legacy compatibility mapping.
 * Used during project creation to validate template compatibility.
 */
export function mapDefinitionToLegacyKey(definitionName: string): PhaseKey | null {
  return LABEL_TO_KEY.get(definitionName.toLowerCase()) ?? null;
}

/**
 * Validate that a set of template definition names maps to exactly one key each,
 * with no duplicates. Returns the mapped keys in definition order, or null if
 * the template is not legacy-compatible.
 */
export function validateTemplateLegacyCompat(
  definitions: { name: string; order_index: number }[],
): PhaseKey[] | null {
  const keys: PhaseKey[] = [];
  const used = new Set<PhaseKey>();
  for (const def of definitions) {
    const key = mapDefinitionToLegacyKey(def.name);
    if (!key) return null;
    if (used.has(key)) return null;
    used.add(key);
    keys.push(key);
  }
  return keys;
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

export function availablePhaseCommands(phase: PhaseState & { key: PhaseKey }): PhaseCommand[] {
  const commands: PhaseCommand[] = [];
  const { status, isLocked, key } = phase;
  if (status === "PENDING") commands.push("activate", "bypass");
  if (!isLocked) {
    if (status === "IN_PROGRESS" && isLegacySupervisionPhase(key)) commands.push("completeSupervision");
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
