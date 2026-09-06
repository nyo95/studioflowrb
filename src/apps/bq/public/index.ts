import { BQ_PERMISSIONS } from "../service";
import { calculateItem, calculateProject, type ItemInput } from "../lib/calculation-engine";
import { toDecimalString } from "@platform/utilities/decimal";

export { BQ_PERMISSIONS };

export type BqLibItemRead = {
  id: string;
  type: "material" | "labor" | "material_labor" | "custom";
  name: string;
  purchaseUnit: string;
  baseUnit: string | null;
  harga: string;
  currency: string;
  defaultKoefisien: string;
  kategori: string;
  notes: string | null;
  promotionStatus: string;
  masterdataRefId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type BqPromotionRequest = {
  id: string;
  type: "material" | "labor" | "material_labor";
  name: string;
  purchaseUnit: string;
  baseUnit: string | null;
  kategori: string;
  notes: string | null;
  createdBy: string;
};

export type BqTemplateRead = {
  id: string;
  name: string;
  description: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  sections: BqTemplateSectionRead[];
};

export type BqTemplateSectionRead = {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  recommendations: BqTemplateRecommendationRead[];
};

export type BqTemplateRecommendationRead = {
  id: string;
  sortOrder: number;
  libItem: BqLibItemRead | null;
};

export type BqAssemblyTemplateRead = {
  id: string;
  name: string;
  description: string | null;
  lineCount: number;
};

export type BqAssemblyLineRead = {
  id: string;
  title: string;
  purchaseUnit: string;
  harga: string;
  currency: string;
  kategori: string;
  qty: string;
  koefisien: string;
  sortOrder: number;
  notes: string | null;
};

export type BqAssemblyTemplateDetail = BqAssemblyTemplateRead & {
  lines: BqAssemblyLineRead[];
};

export type BqProjectSummary = {
  id: string;
  title: string;
  clientName: string;
  status: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  grandTotal: string | null;
};

export type BqProjectDetail = {
  id: string;
  title: string;
  clientName: string;
  status: string;
  externalRef: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  grandTotal: string | null;
  sections: BqSectionDetail[];
};

export type BqSectionDetail = {
  id: string;
  name: string;
  sortOrder: number;
  subsections: BqSubsectionDetail[];
  items: BqItemDetail[];
};

export type BqSubsectionDetail = {
  id: string;
  name: string;
  sortOrder: number;
  items: BqItemDetail[];
};

export type BqItemDetail = {
  id: string;
  name: string;
  qty: string;
  unit: string;
  hargaSnapshot: string | null;
  koefisien: string;
  markupL1Pct: string;
  sortOrder: number;
  notes: string | null;
  subObjects: BqSubObjectDetail[];
  lineItems: BqLineItemDetail[];
  /**
   * Server-computed amounts. bq-contract §2 forbids calculating in the client,
   * and §13.1 needs rate and total on a collapsed L1, so they travel with the
   * row. `null` means this L1 cannot be priced yet — a standalone item with no
   * price entered — which is stated rather than shown as a confident zero.
   */
  biayaPokok: string | null;
  rate: string | null;
  total: string | null;
};

export type BqSubObjectDetail = {
  id: string;
  name: string;
  qtyPerL1: string;
  markupL2Pct: string;
  sortOrder: number;
  notes: string | null;
  lineItems: BqLineItemDetail[];
  subtotalL2Raw: string | null;
  subtotalL2: string | null;
};

export type BqLineItemDetail = {
  id: string;
  sourceType: string;
  sourceRefId: string | null;
  sourceImportedAt: string | null;
  titleSnapshot: string;
  purchaseUnitSnapshot: string;
  baseUnitSnapshot: string | null;
  purchaseToBaseFactorSnapshot: string | null;
  hargaSnapshot: string;
  currencySnapshot: string;
  kategori: string;
  qty: string;
  koefisien: string;
  sortOrder: number;
  notes: string | null;
  biayaLine: string | null;
};

import type { PrismaClient } from "@/generated/prisma/client";

const PROJECT_ITEM_INCLUDE = {
  sub_objects: {
    orderBy: { sort_order: "asc" },
    include: { line_items: { orderBy: { sort_order: "asc" } } },
  },
  line_items: { orderBy: { sort_order: "asc" } },
} as const;

export function createBqPublicRead(db: PrismaClient) {
  return {
    async listAssemblyTemplates(): Promise<BqAssemblyTemplateRead[]> {
      const assemblies = await db.bqAssemblyTemplate.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { lines: true } } } });
      return assemblies.map((assembly) => ({ id: assembly.id, name: assembly.name, description: assembly.description, lineCount: assembly._count.lines }));
    },

    async getAssemblyTemplateDetail(id: string): Promise<BqAssemblyTemplateDetail | null> {
      const assembly = await db.bqAssemblyTemplate.findUnique({ where: { id }, include: { lines: { orderBy: { sort_order: "asc" } } } });
      if (!assembly) return null;
      return {
        id: assembly.id,
        name: assembly.name,
        description: assembly.description,
        lineCount: assembly.lines.length,
        lines: assembly.lines.map((l) => ({
          id: l.id,
          title: l.title_snapshot,
          purchaseUnit: l.purchase_unit_snapshot,
          harga: String(l.harga_snapshot),
          currency: l.currency_snapshot,
          kategori: l.kategori,
          qty: String(l.qty),
          koefisien: String(l.koefisien),
          sortOrder: l.sort_order,
          notes: l.notes,
        })),
      };
    },
    async listLibraryItems(): Promise<BqLibItemRead[]> {
      const [materials, labors, materialLabors, customItems] = await Promise.all([
        db.bqLibMaterial.findMany({ orderBy: { name: "asc" } }),
        db.bqLibLabor.findMany({ orderBy: { name: "asc" } }),
        db.bqLibMaterialLabor.findMany({ orderBy: { name: "asc" } }),
        db.bqLibCustomItem.findMany({ orderBy: { name: "asc" } }),
      ]);

      const results: BqLibItemRead[] = [];

      for (const m of materials) {
        results.push({
          id: m.id,
          type: "material",
          name: m.name,
          purchaseUnit: m.purchase_unit,
          baseUnit: m.base_unit,
          harga: m.harga.toString(),
          currency: m.currency,
          defaultKoefisien: m.default_koefisien.toString(),
          kategori: m.kategori,
          notes: m.notes,
          promotionStatus: m.promotion_status,
          masterdataRefId: m.masterdata_ref_id,
          createdBy: m.created_by,
          createdAt: m.created_at.toISOString(),
          updatedAt: m.updated_at.toISOString(),
        });
      }

      for (const l of labors) {
        results.push({
          id: l.id,
          type: "labor",
          name: l.name,
          purchaseUnit: l.purchase_unit,
          baseUnit: l.base_unit,
          harga: l.harga.toString(),
          currency: l.currency,
          defaultKoefisien: l.default_koefisien.toString(),
          kategori: l.kategori,
          notes: l.notes,
          promotionStatus: l.promotion_status,
          masterdataRefId: l.masterdata_ref_id,
          createdBy: l.created_by,
          createdAt: l.created_at.toISOString(),
          updatedAt: l.updated_at.toISOString(),
        });
      }

      for (const ml of materialLabors) {
        results.push({
          id: ml.id,
          type: "material_labor",
          name: ml.name,
          purchaseUnit: ml.purchase_unit,
          baseUnit: ml.base_unit,
          harga: ml.harga.toString(),
          currency: ml.currency,
          defaultKoefisien: ml.default_koefisien.toString(),
          kategori: ml.kategori,
          notes: ml.notes,
          promotionStatus: ml.promotion_status,
          masterdataRefId: ml.masterdata_ref_id,
          createdBy: ml.created_by,
          createdAt: ml.created_at.toISOString(),
          updatedAt: ml.updated_at.toISOString(),
        });
      }

      for (const c of customItems) {
        results.push({
          id: c.id,
          type: "custom",
          name: c.name,
          purchaseUnit: c.purchase_unit,
          baseUnit: null,
          harga: c.harga.toString(),
          currency: c.currency,
          defaultKoefisien: c.default_koefisien.toString(),
          kategori: c.kategori,
          notes: c.notes,
          promotionStatus: "DRAFT",
          masterdataRefId: null,
          createdBy: c.created_by,
          createdAt: c.created_at.toISOString(),
          updatedAt: c.updated_at.toISOString(),
        });
      }

      return results;
    },

    async listTemplates(): Promise<BqTemplateRead[]> {
      const [templates, libraryItems] = await Promise.all([
        db.bqTemplate.findMany({
          orderBy: { name: "asc" },
          include: {
            sections: {
              orderBy: { sort_order: "asc" },
              include: {
                recommendations: {
                  orderBy: { sort_order: "asc" },
                },
              },
            },
          },
        }),
        // bq-contract §8.3: a recommendation is a live pointer to a Library
        // item. Returning it unresolved left the Template Editor with rows it
        // could not name. One indexed read serves every template.
        this.listLibraryItems(),
      ]);

      const libraryById = new Map(libraryItems.map((item) => [item.id, item]));

      return templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        createdBy: t.created_by,
        createdAt: t.created_at.toISOString(),
        updatedAt: t.updated_at.toISOString(),
        sections: t.sections.map((s) => ({
          id: s.id,
          name: s.name,
          parentId: s.parent_id,
          sortOrder: s.sort_order,
          recommendations: s.recommendations.map((r) => {
            const refId = r.lib_material_id
              ?? r.lib_labor_id
              ?? r.lib_material_labor_id
              ?? r.lib_custom_item_id;
            return {
              id: r.id,
              sortOrder: r.sort_order,
              libItem: (refId ? libraryById.get(refId) : undefined) ?? null,
            };
          }),
        })),
      }));
    },

    async listProjectSummaries(): Promise<BqProjectSummary[]> {
      // One tree read per project, not a full getProjectDetail round trip each:
      // the list page only needs the L1/L2/L3 numbers that feed the grand total.
      const projects = await db.bqProject.findMany({
        orderBy: { updated_at: "desc" },
        include: {
          sections: {
            include: {
              subsections: { include: { items: { include: PROJECT_ITEM_INCLUDE } } },
              items: { where: { subsection_id: null }, include: PROJECT_ITEM_INCLUDE },
            },
          },
        },
      });

      return projects.map((p) => ({
        id: p.id,
        title: p.title,
        clientName: p.client_name,
        status: p.status,
        createdBy: p.created_by,
        createdAt: p.created_at.toISOString(),
        updatedAt: p.updated_at.toISOString(),
        grandTotal: applyCalculations(
          p.sections.map((s) => ({
            id: s.id,
            name: s.name,
            sortOrder: s.sort_order,
            subsections: s.subsections.map((ss) => ({
              id: ss.id,
              name: ss.name,
              sortOrder: ss.sort_order,
              items: ss.items.map(mapItemDetail),
            })),
            items: s.items.map(mapItemDetail),
          })),
        ),
      }));
    },

    async getProjectDetail(projectId: string): Promise<BqProjectDetail | null> {
      const project = await db.bqProject.findUnique({
        where: { id: projectId },
        include: {
          sections: {
            orderBy: { sort_order: "asc" },
            include: {
              subsections: {
                orderBy: { sort_order: "asc" },
                include: {
                  items: {
                    orderBy: { sort_order: "asc" },
                    include: {
                      sub_objects: {
                        orderBy: { sort_order: "asc" },
                        include: {
                          line_items: {
                            orderBy: { sort_order: "asc" },
                          },
                        },
                      },
                      line_items: {
                        orderBy: { sort_order: "asc" },
                      },
                    },
                  },
                },
              },
              items: {
                where: { subsection_id: null },
                orderBy: { sort_order: "asc" },
                include: {
                  sub_objects: {
                    orderBy: { sort_order: "asc" },
                    include: {
                      line_items: {
                        orderBy: { sort_order: "asc" },
                      },
                    },
                  },
                  line_items: {
                    orderBy: { sort_order: "asc" },
                  },
                },
              },
            },
          },
        },
      });

      if (!project) return null;

      const sections = project.sections.map((s) => ({
        id: s.id,
        name: s.name,
        sortOrder: s.sort_order,
        subsections: s.subsections.map((ss) => ({
          id: ss.id,
          name: ss.name,
          sortOrder: ss.sort_order,
          items: ss.items.map(mapItemDetail),
        })),
        items: s.items.map(mapItemDetail),
      }));

      return {
        id: project.id,
        title: project.title,
        clientName: project.client_name,
        status: project.status,
        externalRef: project.external_ref,
        notes: project.notes,
        createdBy: project.created_by,
        createdAt: project.created_at.toISOString(),
        updatedAt: project.updated_at.toISOString(),
        sections,
        grandTotal: applyCalculations(sections),
      };
    },
  };
}

function flattenItems(sections: BqSectionDetail[]): BqItemDetail[] {
  return sections.flatMap((section) => [
    ...section.items,
    ...section.subsections.flatMap((subsection) => subsection.items),
  ]);
}

/**
 * Runs the engine once and writes its results back onto the rows, so every level
 * carries the number the estimator needs and the client never computes one.
 *
 * A draft may hold an L1 whose price is not entered yet. That single row cannot
 * be priced; the rest of the document still can. Each item is therefore attempted
 * on its own, and the grand total is stated only when every item produced one —
 * a missing total is truthful, a total silently missing a line is not.
 */
function applyCalculations(sections: BqSectionDetail[]): string | null {
  let complete = true;

  for (const item of flattenItems(sections)) {
    let result;
    try {
      result = calculateItem(toCalculationItem(item));
    } catch {
      complete = false;
      item.biayaPokok = null;
      item.rate = null;
      item.total = null;
      for (const subObject of item.subObjects) {
        subObject.subtotalL2Raw = null;
        subObject.subtotalL2 = null;
        for (const line of subObject.lineItems) line.biayaLine = null;
      }
      for (const line of item.lineItems) line.biayaLine = null;
      continue;
    }

    item.biayaPokok = result.biayaPokok ?? null;
    item.rate = result.rate;
    item.total = result.total;
    item.subObjects.forEach((subObject, index) => {
      const computed = result.subObjects?.[index];
      subObject.subtotalL2Raw = computed?.subtotalL2Raw ?? null;
      subObject.subtotalL2 = computed?.subtotalL2 ?? null;
      subObject.lineItems.forEach((line, lineIndex) => {
        line.biayaLine = computed?.lineItems[lineIndex]?.biayaLine ?? null;
      });
    });
    item.lineItems.forEach((line, index) => {
      line.biayaLine = result.lineItemsDirect[index]?.biayaLine ?? null;
    });
  }

  if (!complete) return null;
  try {
    return calculateProject(flattenItems(sections).map(toCalculationItem)).grandTotal;
  } catch {
    return null;
  }
}

function toCalculationItem(item: BqItemDetail): ItemInput {
  return {
    qty: toDecimalString(item.qty),
    markupL1Pct: toDecimalString(item.markupL1Pct),
    hargaSnapshot: item.hargaSnapshot === null ? undefined : toDecimalString(item.hargaSnapshot),
    koefisien: toDecimalString(item.koefisien),
    lineItemsDirect: item.lineItems.map((line) => ({
      qty: toDecimalString(line.qty),
      hargaSnapshot: toDecimalString(line.hargaSnapshot),
      koefisien: toDecimalString(line.koefisien),
    })),
    subObjects: item.subObjects.map((subObject) => ({
      qtyPerL1: toDecimalString(subObject.qtyPerL1),
      markupL2Pct: toDecimalString(subObject.markupL2Pct),
      lineItems: subObject.lineItems.map((line) => ({
        qty: toDecimalString(line.qty),
        hargaSnapshot: toDecimalString(line.hargaSnapshot),
        koefisien: toDecimalString(line.koefisien),
      })),
    })),
  };
}

function mapItemDetail(item: {
  id: string;
  name: string;
  qty: unknown;
  unit: string;
  harga_snapshot: unknown;
  koefisien: unknown;
  markup_l1_pct: unknown;
  sort_order: number;
  notes: string | null;
  sub_objects: Array<{
    id: string;
    name: string;
    qty_per_l1: unknown;
    markup_l2_pct: unknown;
    sort_order: number;
    notes: string | null;
    line_items: Array<{
      id: string;
      source_type: string;
      source_ref_id: string | null;
      source_imported_at: Date | null;
      title_snapshot: string;
      purchase_unit_snapshot: string;
      base_unit_snapshot: string | null;
      purchase_to_base_factor_snapshot: unknown;
      harga_snapshot: unknown;
      currency_snapshot: string;
      kategori: string;
      qty: unknown;
      koefisien: unknown;
      sort_order: number;
      notes: string | null;
    }>;
  }>;
  line_items: Array<{
    id: string;
    source_type: string;
    source_ref_id: string | null;
    source_imported_at: Date | null;
    title_snapshot: string;
    purchase_unit_snapshot: string;
    base_unit_snapshot: string | null;
    purchase_to_base_factor_snapshot: unknown;
    harga_snapshot: unknown;
    currency_snapshot: string;
    kategori: string;
    qty: unknown;
    koefisien: unknown;
    sort_order: number;
    notes: string | null;
  }>;
}): BqItemDetail {
  return {
    id: item.id,
    name: item.name,
    qty: (item.qty as { toString: () => string }).toString(),
    unit: item.unit,
    hargaSnapshot: item.harga_snapshot ? (item.harga_snapshot as { toString: () => string }).toString() : null,
    koefisien: (item.koefisien as { toString: () => string }).toString(),
    markupL1Pct: (item.markup_l1_pct as { toString: () => string }).toString(),
    sortOrder: item.sort_order,
    notes: item.notes,
    subObjects: item.sub_objects.map((so) => ({
      id: so.id,
      name: so.name,
      qtyPerL1: (so.qty_per_l1 as { toString: () => string }).toString(),
      markupL2Pct: (so.markup_l2_pct as { toString: () => string }).toString(),
      sortOrder: so.sort_order,
      notes: so.notes,
      lineItems: so.line_items.map(mapLineItemDetail),
      subtotalL2Raw: null,
      subtotalL2: null,
    })),
    lineItems: item.line_items.map(mapLineItemDetail),
    biayaPokok: null,
    rate: null,
    total: null,
  };
}

function mapLineItemDetail(li: {
  id: string;
  source_type: string;
  source_ref_id: string | null;
  source_imported_at: Date | null;
  title_snapshot: string;
  purchase_unit_snapshot: string;
  base_unit_snapshot: string | null;
  purchase_to_base_factor_snapshot: unknown;
  harga_snapshot: unknown;
  currency_snapshot: string;
  kategori: string;
  qty: unknown;
  koefisien: unknown;
  sort_order: number;
  notes: string | null;
}): BqLineItemDetail {
  return {
    id: li.id,
    sourceType: li.source_type,
    sourceRefId: li.source_ref_id,
    sourceImportedAt: li.source_imported_at?.toISOString() ?? null,
    titleSnapshot: li.title_snapshot,
    purchaseUnitSnapshot: li.purchase_unit_snapshot,
    baseUnitSnapshot: li.base_unit_snapshot,
    purchaseToBaseFactorSnapshot: li.purchase_to_base_factor_snapshot
      ? (li.purchase_to_base_factor_snapshot as { toString: () => string }).toString()
      : null,
    hargaSnapshot: (li.harga_snapshot as { toString: () => string }).toString(),
    currencySnapshot: li.currency_snapshot,
    kategori: li.kategori,
    qty: (li.qty as { toString: () => string }).toString(),
    koefisien: (li.koefisien as { toString: () => string }).toString(),
    sortOrder: li.sort_order,
    notes: li.notes,
    biayaLine: null,
  };
}
