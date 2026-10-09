/**
 * The name a saved Presentation PDF is offered under: the date, the project, then the board, for example
 * `20261009 Sociolla SG Funan Material Funan`. The project's own number (`2026-506`) is left out: it is the first thing
 * in the project name and the date already leads the file name.
 */
export function printTitle(input: { date: Date; timeZone: string; projectName: string; boardTitle: string }): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: input.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(input.date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  const stamp = `${part("year")}${part("month")}${part("day")}`;
  const project = input.projectName.replace(/^\s*\d{4}-\d+\s+/, "").trim() || input.projectName.trim();
  return [stamp, project, input.boardTitle.trim()].filter(Boolean).join(" ");
}
