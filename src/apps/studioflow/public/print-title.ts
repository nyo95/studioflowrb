import { currentDateOnly } from "@platform/utilities/date";

/**
 * The name a saved Presentation PDF is offered under: the date, the project, then the board, for example
 * `20261009 Sociolla SG Funan Material Funan`. The project's own number (`2026-506`) is left out: it is the first thing
 * in the project name and the date already leads the file name.
 */
export function printTitle(input: { date: Date; timeZone: string; projectName: string; boardTitle: string }): string {
  const stamp = currentDateOnly({ now: input.date, timeZone: input.timeZone }).replaceAll("-", "");
  const project = input.projectName.replace(/^\s*\d{4}-\d+\s+/, "").trim() || input.projectName.trim();
  return [stamp, project, input.boardTitle.trim()].filter(Boolean).join(" ");
}
