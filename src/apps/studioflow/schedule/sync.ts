import {
  fallbackPrefix,
  nextGapless,
  normalizeExtraFields,
  orderCardFields,
  scheduleSearchKey,
  type ScheduleExtraField,
  type ScheduleSection,
} from "../domain/schedule";
import { optionalText, requiredText, type TxClient } from "../shared";

/**
 * Schedule row creation shared by the schedule service and project bootstrap
 * (mirrors `tasks/sync.ts` for checklists).
 */

export type SnapshotInput = {
  brandId?: string | null;
  brandName?: string | null;
  /** The product designation shown as the card title ("Type" in the UI and in the legacy sheet). */
  productName: string;
  color?: string | null;
  pattern?: string | null;
  finishing?: string | null;
  dimension?: string | null;
  notes?: string | null;
  extra?: readonly ScheduleExtraField[] | null;
  imageKey?: string | null;
};

export function cleanSnapshot(input: SnapshotInput, options?: { requireProductName?: boolean }): ReturnType<typeof buildSnapshot> {
  // Template items may reserve a category with no product decided yet (owner
  // decision 2026-09-24, folding "default categories" into Template Items) —
  // a live option's snapshot stays required, since a real schedule row always
  // needs the product it names.
  const productName = (options?.requireProductName ?? true)
    ? requiredText(input.productName, "SCHEDULE_PRODUCT_REQUIRED", "Type", 200)
    : optionalText(input.productName, 200) ?? "";
  return buildSnapshot(input, productName);
}

function buildSnapshot(input: SnapshotInput, productName: string) {
  const brandName = optionalText(input.brandName, 160);
  const color = optionalText(input.color, 160);
  const pattern = optionalText(input.pattern, 160);
  const finishing = optionalText(input.finishing, 160);
  const dimension = optionalText(input.dimension, 160);
  const notes = optionalText(input.notes, 2000);
  const imageKey = optionalText(input.imageKey, 500);
  const extra = normalizeExtraFields(input.extra ?? []);
  return {
    brandId: optionalText(input.brandId, 80),
    brandName,
    productName,
    color,
    pattern,
    finishing,
    dimension,
    notes,
    extra,
    imageKey,
    searchKey: scheduleSearchKey({ brandName, productName, color, pattern, finishing, dimension, extra }),
  };
}

export function optionData(snapshot: ReturnType<typeof cleanSnapshot>) {
  return {
    brand_id: snapshot.brandId,
    brand_name: snapshot.brandName,
    product_name: snapshot.productName,
    color: snapshot.color,
    pattern: snapshot.pattern,
    finishing: snapshot.finishing,
    dimension: snapshot.dimension,
    notes: snapshot.notes,
    extra: snapshot.extra,
    image_key: snapshot.imageKey,
    search_key: snapshot.searchKey,
  };
}

export async function resolvePrefix(tx: TxClient, section: ScheduleSection, category: string, categoryKey: string): Promise<string> {
  const row = await tx.sfSchedulePrefix.findUnique({ where: { section_category_key: { section, category_key: categoryKey } } });
  return row?.prefix ?? fallbackPrefix(category);
}

export async function createEntryWithOptionalOption(tx: TxClient, input: {
  projectId: string;
  section: ScheduleSection;
  category: string;
  categoryKey: string;
  qty?: string | null;
  unit?: string | null;
  location?: string | null;
  cardFields?: readonly string[] | null;
  templateItemId?: string | null;
  snapshot?: SnapshotInput | null;
}) {
  // One spelling and one code prefix per category inside a project (the first wins).
  // Persisted rows keep their historical prefix (e.g. PA for Paint) so a new
  // row never starts a mixed PT/PA code sequence for an existing project group.
  const existingCategory = await tx.sfScheduleEntry.findFirst({
    where: {
      project_id: input.projectId,
      section: input.section,
      category_key: input.categoryKey,
    },
    select: {
      category: true,
      prefix: true,
    },
  });
  const categoryLabel = existingCategory?.category ?? input.category;
  const prefix =
    existingCategory?.prefix ??
    (await resolvePrefix(tx, input.section, input.category, input.categoryKey));
  const siblings = await tx.sfScheduleEntry.findMany({ where: { project_id: input.projectId, section: input.section, prefix }, orderBy: { increment: "asc" }, select: { increment: true } });
  const increment = nextGapless(siblings);
  const entry = await tx.sfScheduleEntry.create({
    data: {
      project_id: input.projectId,
      section: input.section,
      category: categoryLabel,
      category_key: input.categoryKey,
      prefix,
      increment,
      sort_order: increment,
      qty: input.qty ?? null,
      unit: input.unit ?? null,
      location: input.location ?? null,
      card_fields: input.cardFields ? orderCardFields(input.cardFields) : undefined,
      template_item_id: input.templateItemId ?? null,
    },
  });
  if (input.snapshot) {
    const snapshot = cleanSnapshot(input.snapshot);
    await tx.sfScheduleOption.create({
      data: { entry_id: entry.id, label: "A", is_final: true, status: "APPROVED", ...optionData(snapshot) },
    });
  }
  return entry;
}


/**
 * Materialize the studio schedule templates in one project (legacy "Apply
 * template" and new-project bootstrap): every active template item once.
 * A template item with a blank Type reserves its category with no product —
 * the "default categories" concept folded into Template Items (owner
 * decision 2026-09-24): a category that should always show up, with no
 * settled default product yet, is just a template item with Type left blank,
 * the same way a live schedule entry already supports "Reserve code only".
 * Idempotent. Returns the number of rows created.
 */
export async function seedScheduleFromTemplates(tx: TxClient, projectId: string): Promise<number> {
  const [items, existing] = await Promise.all([
    tx.sfScheduleTemplateItem.findMany({ where: { is_active: true }, orderBy: [{ section: "asc" }, { sort_order: "asc" }] }),
    tx.sfScheduleEntry.findMany({ where: { project_id: projectId }, select: { template_item_id: true } }),
  ]);
  const templateIds = new Set(existing.map((row) => row.template_item_id).filter(Boolean));
  let created = 0;
  for (const item of items) {
    if (templateIds.has(item.id)) continue;
    await createEntryWithOptionalOption(tx, {
      projectId,
      section: item.section,
      category: item.category,
      categoryKey: item.category_key,
      qty: item.qty?.toString() ?? null,
      unit: item.unit,
      location: item.location,
      cardFields: Array.isArray(item.card_fields) ? (item.card_fields as string[]) : null,
      templateItemId: item.id,
      snapshot: item.product_name ? {
        brandId: item.brand_id,
        brandName: item.brand_name,
        productName: item.product_name,
        color: item.color,
        pattern: item.pattern,
        finishing: item.finishing,
        dimension: item.dimension,
        notes: item.notes,
        extra: normalizeExtraFields(item.extra),
        imageKey: item.image_key,
      } : null,
    });
    created += 1;
  }
  return created;
}
