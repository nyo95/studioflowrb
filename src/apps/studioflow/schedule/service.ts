import {
  SCHEDULE_SECTIONS,
  fallbackPrefix,
  isPermutation,
  nextGapless,
  normalizeScheduleCategory,
  normalizeSchedulePrefix,
  optionLabel,
  parseLegacyScheduleCsv,
  scheduleCode,
  scheduleSearchKey,
  type ScheduleSection,
} from "../domain/schedule";
import {
  P,
  conflict,
  hasPermission,
  invalid,
  loadWritableProject,
  notFound,
  optionalText,
  requireCommand,
  requireRead,
  requiredText,
  writeAudit,
  type CommandContext,
  type Db,
  type ReadContext,
  type StudioFlowPorts,
  type TxClient,
} from "../shared";

const ENTRY_ENTITY = "schedule-entry";
const OPTION_ENTITY = "schedule-option";
const TEMPLATE_ENTITY = "schedule-template";

type SnapshotInput = {
  brandId?: string | null;
  brandName?: string | null;
  productName: string;
  skuText?: string | null;
  color?: string | null;
  finishing?: string | null;
  dimension?: string | null;
  notes?: string | null;
  imageKey?: string | null;
};

function sectionOf(value: string): ScheduleSection {
  if (!(SCHEDULE_SECTIONS as readonly string[]).includes(value)) throw invalid("SCHEDULE_SECTION_INVALID", "Choose Material or Fixture.");
  return value as ScheduleSection;
}

function categoryOf(value: string): { label: string; key: string } {
  const category = normalizeScheduleCategory(value);
  if (!category.label) throw invalid("SCHEDULE_CATEGORY_REQUIRED", "Category is required.");
  if (category.label.length > 80) throw invalid("SCHEDULE_CATEGORY_TOO_LONG", "Category is too long.");
  return category;
}

function prefixOf(value: string, category: string): string {
  const prefix = normalizeSchedulePrefix(value || fallbackPrefix(category));
  if (!prefix) throw invalid("SCHEDULE_PREFIX_REQUIRED", "Prefix is required.");
  return prefix;
}

function decimalText(value: string | null | undefined): string | null {
  const text = optionalText(value, 20);
  if (!text) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw invalid("SCHEDULE_QTY_INVALID", "Quantity must be a positive number with up to two decimals.");
  return text;
}

function cleanSnapshot(input: SnapshotInput) {
  const productName = requiredText(input.productName, "SCHEDULE_PRODUCT_REQUIRED", "Product name", 200);
  const brandName = optionalText(input.brandName, 160);
  const skuText = optionalText(input.skuText, 160);
  const color = optionalText(input.color, 160);
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
    finishing,
    dimension,
    notes,
    imageKey,
    searchKey: scheduleSearchKey({ brandName, productName, skuText, color, finishing, dimension }),
  };
}

function optionData(snapshot: ReturnType<typeof cleanSnapshot>) {
  return {
    brand_id: snapshot.brandId,
    brand_name: snapshot.brandName,
    product_name: snapshot.productName,
    sku_text: snapshot.skuText,
    color: snapshot.color,
    finishing: snapshot.finishing,
    dimension: snapshot.dimension,
    notes: snapshot.notes,
    image_key: snapshot.imageKey,
    search_key: snapshot.searchKey,
  };
}

function templateItemData(snapshot: ReturnType<typeof cleanSnapshot>) {
  return {
    brand_id: snapshot.brandId,
    brand_name: snapshot.brandName,
    product_name: snapshot.productName,
    sku_text: snapshot.skuText,
    color: snapshot.color,
    finishing: snapshot.finishing,
    dimension: snapshot.dimension,
    notes: snapshot.notes,
    image_key: snapshot.imageKey,
  };
}

async function brandSnapshot(ports: StudioFlowPorts, brandId?: string | null): Promise<{ brandId: string | null; brandName: string | null }> {
  const id = optionalText(brandId, 80);
  if (!id) return { brandId: null, brandName: null };
  const brand = await ports.masterData.getBrandLibraryRead(id);
  if (!brand) throw invalid("SCHEDULE_BRAND_NOT_FOUND", "Choose an active Brand.");
  return { brandId: brand.id, brandName: brand.name };
}

function scopeError() {
  return notFound("schedule item");
}

export function createScheduleService(db: Db, ports: StudioFlowPorts) {
  const { runTransaction } = ports;

  async function resolvePrefix(tx: TxClient, section: ScheduleSection, category: string, categoryKey: string): Promise<string> {
    const row = await tx.sfSchedulePrefix.findUnique({ where: { section_category_key: { section, category_key: categoryKey } } });
    return row?.prefix ?? fallbackPrefix(category);
  }

  async function entryIds(tx: TxClient, projectId: string, section: ScheduleSection, prefix: string) {
    return (await tx.sfScheduleEntry.findMany({
      where: { project_id: projectId, section, prefix },
      orderBy: [{ increment: "asc" }, { created_at: "asc" }],
      select: { id: true },
    })).map((row) => row.id);
  }

  async function renumber(tx: TxClient, projectId: string, section: ScheduleSection, prefix: string, orderedIds?: readonly string[]) {
    const ids = orderedIds ? [...orderedIds] : await entryIds(tx, projectId, section, prefix);
    const temporaryBase = ids.length + 1_000;
    for (const [index, id] of ids.entries()) {
      await tx.sfScheduleEntry.update({ where: { id }, data: { increment: temporaryBase + index, sort_order: index + 1 } });
    }
    for (const [index, id] of ids.entries()) {
      await tx.sfScheduleEntry.update({ where: { id }, data: { increment: index + 1, sort_order: index + 1 } });
    }
  }

  async function loadEntry(tx: TxClient, projectId: string, entryId: string, write: boolean) {
    const entry = await tx.sfScheduleEntry.findUnique({ where: { id: entryId } });
    if (!entry || entry.project_id !== projectId) throw scopeError();
    if (write) await loadWritableProject(tx, projectId);
    return entry;
  }

  async function loadOption(tx: TxClient, projectId: string, optionId: string, write: boolean) {
    const option = await tx.sfScheduleOption.findUnique({ where: { id: optionId }, include: { entry: true } });
    if (!option || option.entry.project_id !== projectId) throw scopeError();
    if (write) await loadWritableProject(tx, projectId);
    return option;
  }

  async function nextLabel(tx: TxClient, entryId: string) {
    const count = await tx.sfScheduleOption.count({ where: { entry_id: entryId } });
    return optionLabel(count);
  }

  async function promoteFirstOption(tx: TxClient, entryId: string) {
    const next = await tx.sfScheduleOption.findFirst({ where: { entry_id: entryId }, orderBy: [{ label: "asc" }, { created_at: "asc" }] });
    if (!next) return;
    await tx.sfScheduleOption.update({ where: { id: next.id }, data: { is_final: true, status: "APPROVED" } });
    await tx.sfScheduleEntry.update({ where: { id: entryId }, data: { active_index: 0 } });
  }

  async function createEntryWithOptionalOption(tx: TxClient, input: {
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
    const siblings = await tx.sfScheduleEntry.findMany({ where: { project_id: input.projectId, section: input.section, prefix }, orderBy: { increment: "asc" }, select: { increment: true } });
    const increment = nextGapless(siblings);
    const entry = await tx.sfScheduleEntry.create({
      data: {
        project_id: input.projectId,
        section: input.section,
        category: input.category,
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

  return {
    canManage(grants: ReadContext["grants"]) {
      return hasPermission(grants, P.access) && hasPermission(grants, P.scheduleManage);
    },

    async listSchedule(input: ReadContext & { projectId: string; section?: string }) {
      requireRead(input.grants);
      const section = input.section ? sectionOf(input.section) : undefined;
      const rows = await db.sfScheduleEntry.findMany({
        where: { project_id: input.projectId, ...(section ? { section } : {}) },
        orderBy: [{ section: "asc" }, { category_key: "asc" }, { increment: "asc" }],
        include: { options: { orderBy: [{ label: "asc" }] } },
      });
      return rows.map((entry) => ({
        id: entry.id,
        projectId: entry.project_id,
        section: entry.section,
        category: entry.category,
        prefix: entry.prefix,
        increment: entry.increment,
        code: scheduleCode(entry.prefix, entry.increment),
        qty: entry.qty?.toString() ?? null,
        unit: entry.unit,
        location: entry.location,
        versionLocked: entry.version_locked,
        templateItemId: entry.template_item_id,
        options: entry.options.map((option) => ({
          id: option.id,
          label: option.label,
          isFinal: option.is_final,
          status: option.status,
          brandId: option.brand_id,
          brandName: option.brand_name,
          productName: option.product_name,
          skuText: option.sku_text,
          color: option.color,
          finishing: option.finishing,
          dimension: option.dimension,
          notes: option.notes,
          imageKey: option.image_key,
        })),
      }));
    },

    async listPrefixes(input: ReadContext) {
      requireRead(input.grants);
      return db.sfSchedulePrefix.findMany({ orderBy: [{ section: "asc" }, { category_key: "asc" }] });
    },

    async listBrandChoices(input: ReadContext & { search?: string }) {
      requireRead(input.grants);
      const brands = await ports.masterData.listBrandLibraryReads({ search: input.search });
      return brands.map((brand) => ({ id: brand.id, name: brand.name }));
    },

    async upsertPrefix(input: CommandContext & { section: string; category: string; prefix: string }) {
      requireCommand(input, P.settingsManage);
      const section = sectionOf(input.section);
      const category = categoryOf(input.category);
      const prefix = prefixOf(input.prefix, category.label);
      return runTransaction(async (tx) => {
        const row = await tx.sfSchedulePrefix.upsert({
          where: { section_category_key: { section, category_key: category.key } },
          update: { category: category.label, prefix },
          create: { section, category: category.label, category_key: category.key, prefix },
        });
        await writeAudit(ports, tx, { action: "studioflow.schedule.prefix-upserted", entityType: TEMPLATE_ENTITY, entityId: row.id, actor: input.actor, metadata: { section, category: category.label, prefix } });
        return { prefixId: row.id };
      });
    },

    async listTemplates(input: ReadContext) {
      requireRead(input.grants);
      return db.sfScheduleTemplateCategory.findMany({
        orderBy: [{ section: "asc" }, { sort_order: "asc" }, { category_key: "asc" }],
        include: { items: { orderBy: [{ sort_order: "asc" }, { created_at: "asc" }] } },
      });
    },

    async upsertTemplateCategory(input: CommandContext & { section: string; category: string; isDefaultEntry?: boolean; isActive?: boolean }) {
      requireCommand(input, P.settingsManage);
      const section = sectionOf(input.section);
      const category = categoryOf(input.category);
      return runTransaction(async (tx) => {
        const count = await tx.sfScheduleTemplateCategory.count({ where: { section } });
        const row = await tx.sfScheduleTemplateCategory.upsert({
          where: { section_category_key: { section, category_key: category.key } },
          update: { category: category.label, is_default_entry: input.isDefaultEntry ?? false, is_active: input.isActive ?? true },
          create: { section, category: category.label, category_key: category.key, is_default_entry: input.isDefaultEntry ?? false, is_active: input.isActive ?? true, sort_order: count + 1 },
        });
        await writeAudit(ports, tx, { action: "studioflow.schedule.template-category-upserted", entityType: TEMPLATE_ENTITY, entityId: row.id, actor: input.actor, metadata: { section, category: category.label } });
        return { templateCategoryId: row.id };
      });
    },

    async createTemplateItem(input: CommandContext & { templateCategoryId?: string | null; section: string; category: string; snapshot: SnapshotInput; qty?: string | null; unit?: string | null; location?: string | null }) {
      requireCommand(input, P.settingsManage);
      const section = sectionOf(input.section);
      const category = categoryOf(input.category);
      const brand = await brandSnapshot(ports, input.snapshot.brandId);
      const snapshot = cleanSnapshot({ ...input.snapshot, ...brand });
      return runTransaction(async (tx) => {
        const parent = input.templateCategoryId
          ? await tx.sfScheduleTemplateCategory.findUnique({ where: { id: input.templateCategoryId } })
          : await tx.sfScheduleTemplateCategory.findUnique({ where: { section_category_key: { section, category_key: category.key } } });
        if (input.templateCategoryId && !parent) throw notFound("schedule template");
        const sortOrder = await tx.sfScheduleTemplateItem.count({ where: { section, category_key: category.key } });
        const item = await tx.sfScheduleTemplateItem.create({
          data: {
            template_category_id: parent?.id ?? null,
            section,
            category: category.label,
            category_key: category.key,
            ...templateItemData(snapshot),
            qty: decimalText(input.qty),
            unit: optionalText(input.unit, 40),
            location: optionalText(input.location, 160),
            sort_order: sortOrder + 1,
          },
        });
        await writeAudit(ports, tx, { action: "studioflow.schedule.template-item-created", entityType: TEMPLATE_ENTITY, entityId: item.id, actor: input.actor, metadata: { section, category: category.label } });
        return { templateItemId: item.id };
      });
    },

    async applyTemplates(input: CommandContext & { projectId: string }) {
      requireCommand(input, P.scheduleManage);
      return runTransaction(async (tx) => {
        await loadWritableProject(tx, input.projectId);
        const [categories, items, existing] = await Promise.all([
          tx.sfScheduleTemplateCategory.findMany({ where: { is_active: true, is_default_entry: true }, orderBy: [{ section: "asc" }, { sort_order: "asc" }] }),
          tx.sfScheduleTemplateItem.findMany({ where: { is_active: true }, orderBy: [{ section: "asc" }, { sort_order: "asc" }] }),
          tx.sfScheduleEntry.findMany({ where: { project_id: input.projectId }, select: { section: true, category_key: true, template_item_id: true } }),
        ]);
        const categoryKeys = new Set(existing.map((row) => `${row.section}:${row.category_key}`));
        const templateIds = new Set(existing.map((row) => row.template_item_id).filter(Boolean));
        let created = 0;
        for (const item of items) {
          if (templateIds.has(item.id)) continue;
          await createEntryWithOptionalOption(tx, {
            projectId: input.projectId,
            section: item.section,
            category: item.category,
            categoryKey: item.category_key,
            qty: item.qty?.toString() ?? null,
            unit: item.unit,
            location: item.location,
            templateItemId: item.id,
            snapshot: item.product_name ? {
              brandId: item.brand_id,
              brandName: item.brand_name,
              productName: item.product_name,
              skuText: item.sku_text,
              color: item.color,
              finishing: item.finishing,
              dimension: item.dimension,
              notes: item.notes,
              imageKey: item.image_key,
            } : null,
          });
          categoryKeys.add(`${item.section}:${item.category_key}`);
          created += 1;
        }
        for (const category of categories) {
          const key = `${category.section}:${category.category_key}`;
          if (categoryKeys.has(key)) continue;
          await createEntryWithOptionalOption(tx, { projectId: input.projectId, section: category.section, category: category.category, categoryKey: category.category_key });
          categoryKeys.add(key);
          created += 1;
        }
        if (created > 0) await writeAudit(ports, tx, { action: "studioflow.schedule.templates-applied", entityType: "project", entityId: input.projectId, actor: input.actor, metadata: { created } });
        return { created };
      });
    },

    async createEntry(input: CommandContext & { projectId: string; section: string; category: string; qty?: string | null; unit?: string | null; location?: string | null; snapshot?: SnapshotInput | null }) {
      requireCommand(input, P.scheduleManage);
      const section = sectionOf(input.section);
      const category = categoryOf(input.category);
      const brand = input.snapshot ? await brandSnapshot(ports, input.snapshot.brandId) : { brandId: null, brandName: null };
      return runTransaction(async (tx) => {
        await loadWritableProject(tx, input.projectId);
        const entry = await createEntryWithOptionalOption(tx, {
          projectId: input.projectId,
          section,
          category: category.label,
          categoryKey: category.key,
          qty: decimalText(input.qty),
          unit: optionalText(input.unit, 40),
          location: optionalText(input.location, 160),
          snapshot: input.snapshot ? { ...input.snapshot, ...brand } : null,
        });
        await writeAudit(ports, tx, { action: "studioflow.schedule.entry-created", entityType: ENTRY_ENTITY, entityId: entry.id, actor: input.actor, metadata: { projectId: input.projectId, code: scheduleCode(entry.prefix, entry.increment) } });
        return { entryId: entry.id };
      });
    },

    async updateEntry(input: CommandContext & { projectId: string; entryId: string; qty?: string | null; unit?: string | null; location?: string | null }) {
      requireCommand(input, P.scheduleManage);
      return runTransaction(async (tx) => {
        const entry = await loadEntry(tx, input.projectId, input.entryId, true);
        await tx.sfScheduleEntry.update({ where: { id: entry.id }, data: { qty: decimalText(input.qty), unit: optionalText(input.unit, 40), location: optionalText(input.location, 160) } });
        await writeAudit(ports, tx, { action: "studioflow.schedule.entry-updated", entityType: ENTRY_ENTITY, entityId: entry.id, actor: input.actor, metadata: { projectId: input.projectId } });
        return { entryId: entry.id };
      });
    },

    async deleteEntry(input: CommandContext & { projectId: string; entryId: string }) {
      requireCommand(input, P.scheduleManage);
      return runTransaction(async (tx) => {
        const entry = await loadEntry(tx, input.projectId, input.entryId, true);
        await tx.sfScheduleEntry.delete({ where: { id: entry.id } });
        await renumber(tx, input.projectId, entry.section, entry.prefix);
        await writeAudit(ports, tx, { action: "studioflow.schedule.entry-deleted", entityType: ENTRY_ENTITY, entityId: entry.id, actor: input.actor, metadata: { projectId: input.projectId, code: scheduleCode(entry.prefix, entry.increment) } });
        return { entryId: entry.id };
      });
    },

    async reorderEntries(input: CommandContext & { projectId: string; section: string; prefix: string; orderedIds: string[] }) {
      requireCommand(input, P.scheduleManage);
      const section = sectionOf(input.section);
      const prefix = prefixOf(input.prefix, "Item");
      return runTransaction(async (tx) => {
        await loadWritableProject(tx, input.projectId);
        const current = await entryIds(tx, input.projectId, section, prefix);
        if (!isPermutation(current, input.orderedIds)) throw invalid("SCHEDULE_REORDER_INVALID", "The schedule changed. Refresh and try again.");
        await renumber(tx, input.projectId, section, prefix, input.orderedIds);
        await writeAudit(ports, tx, { action: "studioflow.schedule.entries-reordered", entityType: "project", entityId: input.projectId, actor: input.actor, metadata: { section, prefix, count: input.orderedIds.length } });
        return { count: input.orderedIds.length };
      });
    },

    async createOption(input: CommandContext & { projectId: string; entryId: string; snapshot: SnapshotInput }) {
      requireCommand(input, P.scheduleManage);
      const brand = await brandSnapshot(ports, input.snapshot.brandId);
      const snapshot = cleanSnapshot({ ...input.snapshot, ...brand });
      return runTransaction(async (tx) => {
        const entry = await loadEntry(tx, input.projectId, input.entryId, true);
        const label = await nextLabel(tx, entry.id);
        const option = await tx.sfScheduleOption.create({ data: { entry_id: entry.id, label, ...optionData(snapshot) } });
        await writeAudit(ports, tx, { action: "studioflow.schedule.option-created", entityType: OPTION_ENTITY, entityId: option.id, actor: input.actor, metadata: { projectId: input.projectId, entryId: entry.id, label } });
        return { optionId: option.id };
      });
    },

    async markFinal(input: CommandContext & { projectId: string; optionId: string }) {
      requireCommand(input, P.scheduleManage);
      return runTransaction(async (tx) => {
        const option = await loadOption(tx, input.projectId, input.optionId, true);
        await tx.sfScheduleOption.updateMany({ where: { entry_id: option.entry_id }, data: { is_final: false, status: "NOT_USED" } });
        await tx.sfScheduleOption.update({ where: { id: option.id }, data: { is_final: true, status: "APPROVED" } });
        const siblings = await tx.sfScheduleOption.findMany({ where: { entry_id: option.entry_id }, orderBy: [{ label: "asc" }] });
        await tx.sfScheduleEntry.update({ where: { id: option.entry_id }, data: { active_index: Math.max(siblings.findIndex((row) => row.id === option.id), 0), version_locked: true } });
        await writeAudit(ports, tx, { action: "studioflow.schedule.option-finalized", entityType: OPTION_ENTITY, entityId: option.id, actor: input.actor, metadata: { projectId: input.projectId, entryId: option.entry_id } });
        return { optionId: option.id };
      });
    },

    async deleteOption(input: CommandContext & { projectId: string; optionId: string }) {
      requireCommand(input, P.scheduleManage);
      return runTransaction(async (tx) => {
        const option = await loadOption(tx, input.projectId, input.optionId, true);
        const wasFinal = option.is_final;
        await tx.sfScheduleOption.delete({ where: { id: option.id } });
        if (wasFinal) await promoteFirstOption(tx, option.entry_id);
        await writeAudit(ports, tx, { action: "studioflow.schedule.option-deleted", entityType: OPTION_ENTITY, entityId: option.id, actor: input.actor, metadata: { projectId: input.projectId, entryId: option.entry_id, wasFinal } });
        return { optionId: option.id };
      });
    },

    async searchReusableOptions(input: ReadContext & { projectId: string; query: string; section?: string; limit?: number }) {
      requireRead(input.grants);
      const query = input.query.trim().toLocaleLowerCase("id-ID");
      if (query.length < 2) return [];
      const rows = await db.sfScheduleOption.findMany({
        where: {
          search_key: { contains: query },
          entry: { project_id: { not: input.projectId }, ...(input.section ? { section: sectionOf(input.section) } : {}) },
        },
        include: { entry: { select: { project_id: true, section: true, category: true } } },
        orderBy: { created_at: "desc" },
        take: Math.min(Math.max(input.limit ?? 20, 1), 80),
      });
      return rows.map((row) => ({
        optionId: row.id,
        sourceProjectId: row.entry.project_id,
        section: row.entry.section,
        category: row.entry.category,
        brandName: row.brand_name,
        productName: row.product_name,
        skuText: row.sku_text,
        color: row.color,
        finishing: row.finishing,
        dimension: row.dimension,
      }));
    },

    async copyReusableOption(input: CommandContext & { projectId: string; entryId: string; sourceOptionId: string }) {
      requireCommand(input, P.scheduleManage);
      return runTransaction(async (tx) => {
        const entry = await loadEntry(tx, input.projectId, input.entryId, true);
        const source = await tx.sfScheduleOption.findUnique({ where: { id: input.sourceOptionId }, include: { entry: true } });
        if (!source || source.entry.project_id === input.projectId) throw notFound("reusable option");
        const label = await nextLabel(tx, entry.id);
        const option = await tx.sfScheduleOption.create({
          data: {
            entry_id: entry.id,
            label,
            brand_id: source.brand_id,
            brand_name: source.brand_name,
            product_name: source.product_name,
            sku_text: source.sku_text,
            color: source.color,
            finishing: source.finishing,
            dimension: source.dimension,
            notes: source.notes,
            image_key: source.image_key,
            search_key: source.search_key,
          },
        });
        await writeAudit(ports, tx, { action: "studioflow.schedule.option-reused", entityType: OPTION_ENTITY, entityId: option.id, actor: input.actor, metadata: { projectId: input.projectId, sourceOptionId: source.id } });
        return { optionId: option.id };
      });
    },

    async importCsv(input: CommandContext & { projectId: string; section: string; csv: string }) {
      requireCommand(input, P.scheduleManage);
      const section = sectionOf(input.section);
      const rows = parseLegacyScheduleCsv(input.csv);
      if (rows.length === 0) throw invalid("SCHEDULE_CSV_EMPTY", "The CSV has no rows.");
      return runTransaction(async (tx) => {
        await loadWritableProject(tx, input.projectId);
        let created = 0;
        for (const row of rows) {
          const category = categoryOf(row.category || row.schedule_category || row.kategori || "Imported");
          const brandName = row.brand || row.catalog_brand || null;
          const productName = row.product || row.product_name || row.catalog_product_name || row.item || "";
          if (!productName.trim()) continue;
          await createEntryWithOptionalOption(tx, {
            projectId: input.projectId,
            section,
            category: category.label,
            categoryKey: category.key,
            qty: decimalText(row.qty || row.quantity || null),
            unit: optionalText(row.unit || null, 40),
            location: optionalText(row.location || row.area || null, 160),
            snapshot: {
              brandName,
              productName,
              skuText: row.sku || row.catalog_sku || null,
              color: row.color || row.catalog_color || null,
              finishing: row.finishing || row.catalog_finishing || null,
              dimension: row.dimension || row.dimensi || null,
              notes: row.notes || row.note || null,
            },
          });
          created += 1;
        }
        if (created === 0) throw invalid("SCHEDULE_CSV_EMPTY", "No usable schedule rows were found.");
        await writeAudit(ports, tx, { action: "studioflow.schedule.csv-imported", entityType: "project", entityId: input.projectId, actor: input.actor, metadata: { section, created } });
        return { created };
      });
    },
  };
}

export type ScheduleService = ReturnType<typeof createScheduleService>;
