import { fallbackPrefix, nextGapless, scheduleSearchKey, type ScheduleSection } from "../domain/schedule";
import { optionalText, requiredText, type TxClient } from "../shared";

/**
 * Schedule row creation shared by the schedule service and project bootstrap
 * (mirrors `tasks/sync.ts` for checklists).
 */

export type SnapshotInput = {
  brandId?: string | null;
  brandName?: string | null;
  productName: string;
  skuText?: string | null;
  color?: string | null;
  pattern?: string | null;
  finishing?: string | null;
  dimension?: string | null;
  notes?: string | null;
  imageKey?: string | null;
};

export function cleanSnapshot(input: SnapshotInput) {
  const productName = requiredText(input.productName, "SCHEDULE_PRODUCT_REQUIRED", "Product name", 200);
  const brandName = optionalText(input.brandName, 160);
  const skuText = optionalText(input.skuText, 160);
  const color = optionalText(input.color, 160);
  const pattern = optionalText(input.pattern, 160);
  const finishing = optionalText(input.finishing, 160);
  const dimension = optionalText(input.dimension, 160);
  const notes = optionalText(input.notes, 2000);
  const imageKey = optionalText(input.imageKey, 500);
  return {
    brandId: optionalText(input.brandId, 80),
    brandName,
    productName,
    skuText,
    color,
    pattern,
    finishing,
    dimension,
    notes,
    imageKey,
    searchKey: scheduleSearchKey({ brandName, productName, skuText, color, pattern, finishing, dimension }),
  };
}

export function optionData(snapshot: ReturnType<typeof cleanSnapshot>) {
  return {
    brand_id: snapshot.brandId,
    brand_name: snapshot.brandName,
    product_name: snapshot.productName,
    sku_text: snapshot.skuText,
    color: snapshot.color,
    pattern: snapshot.pattern,
    finishing: snapshot.finishing,
    dimension: snapshot.dimension,
    notes: snapshot.notes,
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
  templateItemId?: string | null;
  snapshot?: SnapshotInput | null;
}) {
  const prefix = await resolvePrefix(tx, input.section, input.category, input.categoryKey);
  // One spelling per category inside a project (the first one wins).
  const sameCategory = await tx.sfScheduleEntry.findFirst({ where: { project_id: input.projectId, section: input.section, category_key: input.categoryKey }, select: { category: true } });
  const categoryLabel = sameCategory?.category ?? input.category;
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
 * template" and new-project bootstrap): every active template item once, then
 * one empty reserve row for each default category that has no row yet.
 * Idempotent. Returns the number of rows created.
 */
export async function seedScheduleFromTemplates(tx: TxClient, projectId: string): Promise<number> {
  const [categories, items, existing] = await Promise.all([
    tx.sfScheduleTemplateCategory.findMany({ where: { is_active: true, is_default_entry: true }, orderBy: [{ section: "asc" }, { sort_order: "asc" }] }),
    tx.sfScheduleTemplateItem.findMany({ where: { is_active: true }, orderBy: [{ section: "asc" }, { sort_order: "asc" }] }),
    tx.sfScheduleEntry.findMany({ where: { project_id: projectId }, select: { section: true, category_key: true, template_item_id: true } }),
  ]);
  const categoryKeys = new Set(existing.map((row) => `${row.section}:${row.category_key}`));
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
      templateItemId: item.id,
      snapshot: {
        brandId: item.brand_id,
        brandName: item.brand_name,
        productName: item.product_name,
        skuText: item.sku_text,
        color: item.color,
        pattern: item.pattern,
        finishing: item.finishing,
        dimension: item.dimension,
        notes: item.notes,
        imageKey: item.image_key,
      },
    });
    categoryKeys.add(`${item.section}:${item.category_key}`);
    created += 1;
  }
  for (const category of categories) {
    const key = `${category.section}:${category.category_key}`;
    if (categoryKeys.has(key)) continue;
    await createEntryWithOptionalOption(tx, { projectId, section: category.section, category: category.category, categoryKey: category.category_key });
    categoryKeys.add(key);
    created += 1;
  }
  return created;
}
