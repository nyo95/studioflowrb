import { back, fwd, workingDaysBetween } from "./working-time";

export const DEFAULT_PLAN_INTERVALS = { cdMall: 5, cdFinal: 5, gap: 5, fitOutToHandover: 40, handoverToOpening: 10 } as const;
export type PlanIntervals = { [K in keyof typeof DEFAULT_PLAN_INTERVALS]: number };
export function computeProjectPlan(input: { fitOutStart: string; intervals: PlanIntervals; holidays: ReadonlySet<string>; openingDate?: string | null; timelineStart?: string | null; cdDoneDate?: string | null; today: string }) {
  const { fitOutStart: fitOutStart, intervals, holidays } = input;
  const end = back(fitOutStart, intervals.gap, holidays);
  const cdFinalStart = back(end, intervals.cdFinal, holidays);
  const cdMallStart = back(end, intervals.cdMall + intervals.cdFinal, holidays);
  const handover = fwd(fitOutStart, intervals.fitOutToHandover, holidays);
  const openingForecast = fwd(handover, intervals.handoverToOpening, holidays);
  const warnings: string[] = [];
  if (input.openingDate && openingForecast > input.openingDate) warnings.push(`Opening forecast is ${workingDaysBetween(input.openingDate, openingForecast, holidays)} working day(s) late.`);
  if (input.openingDate && input.openingDate >= handover && workingDaysBetween(handover, input.openingDate, holidays) < intervals.handoverToOpening) warnings.push("Opening date leaves a tight handover window.");
  if (input.timelineStart && input.timelineStart > cdMallStart) warnings.push("Timeline start is later than Design Final.");
  if ([cdMallStart, cdFinalStart, end, fitOutStart, handover, openingForecast].some((date) => date < input.today)) warnings.push("One or more computed dates are in the past.");
  return { milestones: { designFinal: cdMallStart, cdMallStart, cdFinalStart, end, fitOutStart, handover, openingForecast }, warnings, suggestedFitOutStart: input.cdDoneDate ? fwd(input.cdDoneDate, intervals.gap, holidays) : null };
}
