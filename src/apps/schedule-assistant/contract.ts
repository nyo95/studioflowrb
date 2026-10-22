import { z } from "zod";

/**
 * Schedule Assistant v1 wire contract (docs/apps/schedule-assistant/CONTRACT.md). The MCP bridge mirrors these shapes;
 * unknown keys are refused. Text limits follow the StudioFlow schedule rules.
 */

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => text(max).nullable().optional();
const id = z.string().uuid();

export const ScheduleAssistantOptionSchema = z.object({
  brandId: id.nullable().optional(),
  /** The Brand the brief names, used only to suggest Master Data Brands; never stored. */
  brandName: optionalText(160),
  productName: text(200),
  color: optionalText(160),
  pattern: optionalText(160),
  finishing: optionalText(160),
  dimension: optionalText(160),
  notes: optionalText(2000),
  extra: z.array(z.object({ label: text(80), value: text(500) }).strict()).max(30).optional(),
}).strict();

export const ScheduleAssistantOptionPatchSchema = ScheduleAssistantOptionSchema.partial().strict();

const targetShape = { entryId: id.optional(), entryRef: text(80).min(1).optional() };
const oneTarget = (value: { entryId?: string; entryRef?: string }) => (value.entryId === undefined) !== (value.entryRef === undefined);
const TARGET_MESSAGE = "Send exactly one of entryId or entryRef.";

export const ScheduleAssistantOperationSchema = z.union([
  z.object({ op: z.literal("apply_templates") }).strict(),
  z.object({ op: z.literal("create_entry"), ref: text(80).min(1).optional(), section: z.enum(["MATERIAL", "FIXTURE"]), category: text(80), qty: optionalText(20), unit: optionalText(40), location: optionalText(160), option: ScheduleAssistantOptionSchema.optional() }).strict(),
  z.object({ op: z.literal("update_entry"), entryId: id, qty: optionalText(20), unit: optionalText(40), location: optionalText(160) }).strict(),
  z.object({ op: z.literal("create_option"), ...targetShape, option: ScheduleAssistantOptionSchema }).strict().refine(oneTarget, TARGET_MESSAGE),
  z.object({ op: z.literal("reuse_option"), ...targetShape, sourceOptionId: id }).strict().refine(oneTarget, TARGET_MESSAGE),
  z.object({ op: z.literal("update_option"), optionId: id, patch: ScheduleAssistantOptionPatchSchema }).strict(),
  z.object({ op: z.literal("finalize_option"), optionId: id }).strict(),
]);

export const SCHEDULE_ASSISTANT_MAX_OPERATIONS = 100;
export const SCHEDULE_ASSISTANT_BODY_LIMIT_BYTES = 256 * 1024;

export const PreviewRequestSchema = z.object({ operations: z.array(ScheduleAssistantOperationSchema).min(1).max(SCHEDULE_ASSISTANT_MAX_OPERATIONS) }).strict();
export const ApplyRequestSchema = z.object({
  operationId: id,
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  operations: z.array(ScheduleAssistantOperationSchema).min(1).max(SCHEDULE_ASSISTANT_MAX_OPERATIONS),
}).strict();

export const SearchQuerySchema = z.string().trim().min(2).max(80);
export const SectionQuerySchema = z.enum(["MATERIAL", "FIXTURE"]).optional();

export type ScheduleAssistantOperation = z.infer<typeof ScheduleAssistantOperationSchema>;
