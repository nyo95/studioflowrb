CREATE SCHEMA IF NOT EXISTS "bq";

CREATE TYPE "bq"."BqPromotionStatus" AS ENUM ('DRAFT', 'REQUESTED', 'APPROVED', 'REJECTED');
CREATE TYPE "bq"."BqProjectStatus" AS ENUM ('DRAFT', 'LOCKED');
CREATE TYPE "bq"."BqKategori" AS ENUM ('MATERIAL', 'UPAH', 'MATERIAL_UPAH', 'BIAYA_UMUM', 'TRANSPORTASI_AKOMODASI', 'ALAT');
CREATE TYPE "bq"."BqLineItemSourceType" AS ENUM ('MASTERDATA', 'BQ_LIBRARY', 'CUSTOM');

CREATE TABLE "bq"."bq_lib_material" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "purchase_unit" TEXT NOT NULL, "base_unit" TEXT,
  "harga" DECIMAL(18,4) NOT NULL, "currency" TEXT NOT NULL DEFAULT 'IDR', "default_koefisien" DECIMAL(18,6) NOT NULL DEFAULT 1,
  "kategori" "bq"."BqKategori" NOT NULL, "notes" TEXT, "promotion_status" "bq"."BqPromotionStatus" NOT NULL DEFAULT 'DRAFT',
  "masterdata_ref_id" TEXT, "created_by" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "bq_lib_material_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bq_lib_material_kategori_check" CHECK ("kategori" = 'MATERIAL'),
  CONSTRAINT "bq_lib_material_positive_check" CHECK ("harga" >= 0 AND "default_koefisien" > 0)
);
CREATE TABLE "bq"."bq_lib_labor" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "purchase_unit" TEXT NOT NULL, "base_unit" TEXT,
  "harga" DECIMAL(18,4) NOT NULL, "currency" TEXT NOT NULL DEFAULT 'IDR', "default_koefisien" DECIMAL(18,6) NOT NULL DEFAULT 1,
  "kategori" "bq"."BqKategori" NOT NULL, "notes" TEXT, "promotion_status" "bq"."BqPromotionStatus" NOT NULL DEFAULT 'DRAFT',
  "masterdata_ref_id" TEXT, "created_by" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "bq_lib_labor_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bq_lib_labor_kategori_check" CHECK ("kategori" = 'UPAH'),
  CONSTRAINT "bq_lib_labor_positive_check" CHECK ("harga" >= 0 AND "default_koefisien" > 0)
);
CREATE TABLE "bq"."bq_lib_material_labor" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "purchase_unit" TEXT NOT NULL, "base_unit" TEXT,
  "harga" DECIMAL(18,4) NOT NULL, "currency" TEXT NOT NULL DEFAULT 'IDR', "default_koefisien" DECIMAL(18,6) NOT NULL DEFAULT 1,
  "kategori" "bq"."BqKategori" NOT NULL, "notes" TEXT, "promotion_status" "bq"."BqPromotionStatus" NOT NULL DEFAULT 'DRAFT',
  "masterdata_ref_id" TEXT, "created_by" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "bq_lib_material_labor_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bq_lib_material_labor_kategori_check" CHECK ("kategori" = 'MATERIAL_UPAH'),
  CONSTRAINT "bq_lib_material_labor_positive_check" CHECK ("harga" >= 0 AND "default_koefisien" > 0)
);
CREATE TABLE "bq"."bq_lib_custom_item" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "purchase_unit" TEXT NOT NULL, "harga" DECIMAL(18,4) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'IDR', "default_koefisien" DECIMAL(18,6) NOT NULL DEFAULT 1,
  "kategori" "bq"."BqKategori" NOT NULL, "notes" TEXT, "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bq_lib_custom_item_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bq_lib_custom_item_kategori_check" CHECK ("kategori" IN ('BIAYA_UMUM', 'TRANSPORTASI_AKOMODASI', 'ALAT')),
  CONSTRAINT "bq_lib_custom_item_positive_check" CHECK ("harga" >= 0 AND "default_koefisien" > 0)
);

CREATE TABLE "bq"."bq_template" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT, "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bq_template_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "bq"."bq_template_section" (
  "id" TEXT NOT NULL, "template_id" TEXT NOT NULL, "name" TEXT NOT NULL, "parent_id" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0, "created_by" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bq_template_section_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "bq"."bq_template_recommendation" (
  "id" TEXT NOT NULL, "template_section_id" TEXT NOT NULL, "sort_order" INTEGER NOT NULL DEFAULT 0,
  "lib_material_id" TEXT, "lib_labor_id" TEXT, "lib_material_labor_id" TEXT, "lib_custom_item_id" TEXT,
  CONSTRAINT "bq_template_recommendation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bq_template_recommendation_one_source_check" CHECK (
    ("lib_material_id" IS NOT NULL)::int + ("lib_labor_id" IS NOT NULL)::int +
    ("lib_material_labor_id" IS NOT NULL)::int + ("lib_custom_item_id" IS NOT NULL)::int = 1)
);

CREATE TABLE "bq"."bq_project" (
  "id" TEXT NOT NULL, "title" TEXT NOT NULL, "client_name" TEXT NOT NULL, "status" "bq"."BqProjectStatus" NOT NULL DEFAULT 'DRAFT',
  "external_ref" TEXT, "notes" TEXT, "created_by" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "bq_project_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "bq"."bq_section" (
  "id" TEXT NOT NULL, "project_id" TEXT NOT NULL, "name" TEXT NOT NULL, "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "bq_section_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "bq"."bq_subsection" (
  "id" TEXT NOT NULL, "section_id" TEXT NOT NULL, "name" TEXT NOT NULL, "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "bq_subsection_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "bq"."bq_item" (
  "id" TEXT NOT NULL, "section_id" TEXT, "subsection_id" TEXT, "name" TEXT NOT NULL, "qty" DECIMAL(18,6) NOT NULL,
  "unit" TEXT NOT NULL, "harga_snapshot" DECIMAL(18,4), "koefisien" DECIMAL(18,6) NOT NULL DEFAULT 1,
  "markup_l1_pct" DECIMAL(6,4) NOT NULL DEFAULT 0, "sort_order" INTEGER NOT NULL DEFAULT 0, "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bq_item_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bq_item_one_parent_check" CHECK (("section_id" IS NOT NULL) <> ("subsection_id" IS NOT NULL)),
  CONSTRAINT "bq_item_positive_check" CHECK ("qty" > 0 AND "koefisien" > 0 AND ("harga_snapshot" IS NULL OR "harga_snapshot" >= 0))
);
CREATE TABLE "bq"."bq_sub_object" (
  "id" TEXT NOT NULL, "item_id" TEXT NOT NULL, "name" TEXT NOT NULL, "qty_per_l1" DECIMAL(18,6) NOT NULL,
  "markup_l2_pct" DECIMAL(6,4) NOT NULL DEFAULT 0, "sort_order" INTEGER NOT NULL DEFAULT 0, "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bq_sub_object_pkey" PRIMARY KEY ("id"), CONSTRAINT "bq_sub_object_positive_check" CHECK ("qty_per_l1" > 0)
);
CREATE TABLE "bq"."bq_line_item" (
  "id" TEXT NOT NULL, "sub_object_id" TEXT, "item_id" TEXT, "source_type" "bq"."BqLineItemSourceType" NOT NULL,
  "source_ref_id" TEXT, "source_imported_at" TIMESTAMP(3), "title_snapshot" TEXT NOT NULL, "purchase_unit_snapshot" TEXT NOT NULL,
  "base_unit_snapshot" TEXT, "purchase_to_base_factor_snapshot" DECIMAL(18,6), "harga_snapshot" DECIMAL(18,4) NOT NULL,
  "currency_snapshot" TEXT NOT NULL DEFAULT 'IDR', "kategori" "bq"."BqKategori" NOT NULL, "qty" DECIMAL(18,6) NOT NULL,
  "koefisien" DECIMAL(18,6) NOT NULL DEFAULT 1, "sort_order" INTEGER NOT NULL DEFAULT 0, "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bq_line_item_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bq_line_item_one_parent_check" CHECK (("sub_object_id" IS NOT NULL) <> ("item_id" IS NOT NULL)),
  CONSTRAINT "bq_line_item_positive_check" CHECK ("qty" > 0 AND "koefisien" > 0 AND "harga_snapshot" >= 0)
);

ALTER TABLE "bq"."bq_template_section" ADD CONSTRAINT "bq_template_section_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "bq"."bq_template"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bq"."bq_template_section" ADD CONSTRAINT "bq_template_section_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "bq"."bq_template_section"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bq"."bq_template_recommendation" ADD CONSTRAINT "bq_template_recommendation_template_section_id_fkey" FOREIGN KEY ("template_section_id") REFERENCES "bq"."bq_template_section"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bq"."bq_template_recommendation" ADD CONSTRAINT "bq_template_recommendation_lib_material_id_fkey" FOREIGN KEY ("lib_material_id") REFERENCES "bq"."bq_lib_material"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bq"."bq_template_recommendation" ADD CONSTRAINT "bq_template_recommendation_lib_labor_id_fkey" FOREIGN KEY ("lib_labor_id") REFERENCES "bq"."bq_lib_labor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bq"."bq_template_recommendation" ADD CONSTRAINT "bq_template_recommendation_lib_material_labor_id_fkey" FOREIGN KEY ("lib_material_labor_id") REFERENCES "bq"."bq_lib_material_labor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bq"."bq_template_recommendation" ADD CONSTRAINT "bq_template_recommendation_lib_custom_item_id_fkey" FOREIGN KEY ("lib_custom_item_id") REFERENCES "bq"."bq_lib_custom_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bq"."bq_section" ADD CONSTRAINT "bq_section_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "bq"."bq_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bq"."bq_subsection" ADD CONSTRAINT "bq_subsection_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "bq"."bq_section"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bq"."bq_item" ADD CONSTRAINT "bq_item_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "bq"."bq_section"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bq"."bq_item" ADD CONSTRAINT "bq_item_subsection_id_fkey" FOREIGN KEY ("subsection_id") REFERENCES "bq"."bq_subsection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bq"."bq_sub_object" ADD CONSTRAINT "bq_sub_object_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "bq"."bq_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bq"."bq_line_item" ADD CONSTRAINT "bq_line_item_sub_object_id_fkey" FOREIGN KEY ("sub_object_id") REFERENCES "bq"."bq_sub_object"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bq"."bq_line_item" ADD CONSTRAINT "bq_line_item_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "bq"."bq_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "bq_template_section_template_id_parent_id_sort_order_idx" ON "bq"."bq_template_section"("template_id", "parent_id", "sort_order");
CREATE INDEX "bq_template_recommendation_template_section_id_idx" ON "bq"."bq_template_recommendation"("template_section_id");
CREATE INDEX "bq_section_project_id_sort_order_idx" ON "bq"."bq_section"("project_id", "sort_order");
CREATE INDEX "bq_subsection_section_id_sort_order_idx" ON "bq"."bq_subsection"("section_id", "sort_order");
CREATE INDEX "bq_item_section_id_sort_order_idx" ON "bq"."bq_item"("section_id", "sort_order");
CREATE INDEX "bq_item_subsection_id_sort_order_idx" ON "bq"."bq_item"("subsection_id", "sort_order");
CREATE INDEX "bq_sub_object_item_id_sort_order_idx" ON "bq"."bq_sub_object"("item_id", "sort_order");
CREATE INDEX "bq_line_item_sub_object_id_sort_order_idx" ON "bq"."bq_line_item"("sub_object_id", "sort_order");
CREATE INDEX "bq_line_item_item_id_sort_order_idx" ON "bq"."bq_line_item"("item_id", "sort_order");
