/**
 * Derived StudioFlow labels (project-contract §5.2).
 *
 * A round label is `<round_prefix><number>` with no separator, falling back to
 * the phase name when the phase snapshot carries no prefix. It is derived on
 * every read and never stored, so this module is the single place the format
 * exists — the service builds the `{round}` filename token from it and the
 * project surfaces render round rows and "sent in" labels from it.
 *
 * Pure and dependency-free on purpose: the same rule has to be reachable from
 * the server service and from client components without dragging Prisma or
 * node built-ins into the browser bundle.
 */

export type RoundLabelPhase = {
  round_prefix: string | null;
  name: string;
};

export function roundLabel(phase: RoundLabelPhase, number: number): string {
  return `${phase.round_prefix ?? phase.name}${number}`;
}
