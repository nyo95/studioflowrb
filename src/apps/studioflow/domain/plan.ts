import { back, fwd, workingDaysBetween } from "./working-time";

export const DEFAULT_PLAN_INTERVALS = { cdMall: 0, cdFinal: 5, gap: 5, fitOutToHandover: 40, handoverToOpening: 10 } as const;
export type PlanIntervals = { [K in keyof typeof DEFAULT_PLAN_INTERVALS]: number };
export function computeProjectPlan(input: { fitOutStart?: string | null; designHandover?: string | null; intervals: PlanIntervals; holidays: ReadonlySet<string>; openingDate?: string | null; timelineStart?: string | null; cdDoneDate?: string | null; today: string }) {
  const { intervals, holidays } = input;
  // Existing projects retain the previous Fit Out Start anchor until their owner sets Design Handover.
  const handover = input.designHandover ?? (input.fitOutStart ? fwd(input.fitOutStart, intervals.fitOutToHandover, holidays) : null);
  if (!handover) return null;
  const fitOutStart = back(handover, intervals.fitOutToHandover, holidays);
  const end = back(fitOutStart, intervals.gap, holidays);
  const cdFinalStart = back(end, intervals.cdFinal, holidays);
  const cdMallStart = back(cdFinalStart, intervals.cdMall, holidays);
  const designFinal = cdMallStart;
  const openingForecast = fwd(handover, intervals.handoverToOpening, holidays);
  const warnings: string[] = [];
  if (input.openingDate && openingForecast > input.openingDate) warnings.push(`Opening forecast is ${workingDaysBetween(input.openingDate, openingForecast, holidays)} working day(s) late.`);
  if (input.openingDate && input.openingDate >= handover && workingDaysBetween(handover, input.openingDate, holidays) < intervals.handoverToOpening) warnings.push("Opening date leaves a tight handover window.");
  if (input.timelineStart && input.timelineStart > designFinal) warnings.push("Project Start is later than Design Final.");
  if ([designFinal, cdFinalStart, end, fitOutStart, handover, openingForecast].some((date) => date < input.today)) warnings.push("One or more computed dates are before today.");
  return { milestones: { designFinal, cdMallStart, cdFinalStart, end, fitOutStart, handover, openingForecast }, warnings, suggestedFitOutStart: input.cdDoneDate ? fwd(input.cdDoneDate, intervals.gap, holidays) : null };
}
