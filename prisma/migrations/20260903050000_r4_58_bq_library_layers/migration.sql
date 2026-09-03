-- BQ Library R4.58: reusable assembly blueprints and project-local standard
-- template placeholders. Existing project rows are deliberately untouched.

CREATE TABLE "bq"."bq_template_item" (
  "id" TEXT NOT NULL,
  "template_section_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "qty" DECIMAL(18,6) NOT NULL DEFAULT 1,
  "unit" TEXT NOT NULL DEFAULT 'ls',
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bq_template_item_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bq_template_item_positive_check" CHECK ("qty" > 0)
);

ALTER TABLE "bq"."bq_template_item"
  ADD CONSTRAINT "bq_template_item_template_section_id_fkey"
  FOREIGN KEY ("template_section_id") REFERENCES "bq"."bq_template_section"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "bq_template_item_template_section_id_sort_order_idx"
  ON "bq"."bq_template_item"("template_section_id", "sort_order");

CREATE TABLE "bq"."bq_assembly_template" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bq_assembly_template_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bq"."bq_assembly_line" (
  "id" TEXT NOT NULL,
  "assembly_template_id" TEXT NOT NULL,
  "source_type" "bq"."BqLineItemSourceType" NOT NULL,
  "source_ref_id" TEXT,
  "title_snapshot" TEXT NOT NULL,
  "purchase_unit_snapshot" TEXT NOT NULL,
  "base_unit_snapshot" TEXT,
  "purchase_to_base_factor_snapshot" DECIMAL(18,6),
  "harga_snapshot" DECIMAL(18,4) NOT NULL,
  "currency_snapshot" TEXT NOT NULL DEFAULT 'IDR',
  "kategori" "bq"."BqKategori" NOT NULL,
  "qty" DECIMAL(18,6) NOT NULL DEFAULT 1,
  "koefisien" DECIMAL(18,6) NOT NULL DEFAULT 1,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bq_assembly_line_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bq_assembly_line_positive_check" CHECK ("qty" > 0 AND "koefisien" > 0 AND "harga_snapshot" >= 0)
);

ALTER TABLE "bq"."bq_assembly_line"
  ADD CONSTRAINT "bq_assembly_line_assembly_template_id_fkey"
  FOREIGN KEY ("assembly_template_id") REFERENCES "bq"."bq_assembly_template"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "bq_assembly_line_assembly_template_id_sort_order_idx"
  ON "bq"."bq_assembly_line"("assembly_template_id", "sort_order");
