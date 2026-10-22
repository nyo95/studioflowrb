import { z } from "zod";

/** SketchUp v1 wire contract (docs/apps/sketchup/CONTRACT.md). Unknown keys are refused. */

export const CreateEntryRequestSchema = z.object({
  section: z.enum(["MATERIAL", "FIXTURE"]),
  category: z.string().trim().min(1).max(80),
  /** Create the category even though it looks like a studio one (SKETCHUP_CATEGORY_SIMILAR). */
  confirmNewCategory: z.boolean().optional(),
}).strict();

export const SKETCHUP_MAX_RESOLVE = 500;

export const ResolveRequestSchema = z.object({
  entryIds: z.array(z.string().uuid()).min(1).max(SKETCHUP_MAX_RESOLVE),
}).strict();

export const SKETCHUP_BODY_LIMIT_BYTES = 64 * 1024;
