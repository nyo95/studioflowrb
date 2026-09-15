-- SF-R3 — legacy Product Schedule (STUDIOFLOW-REWORK-CONTRACT.md §11).
-- Additive inside the rebuild-only "studioflow" schema. No Master Data FK:
-- Brand facts are snapshotted as typed text/id columns at selection time.

CREATE TYPE "studioflow"."sf_schedule_section" AS ENUM ('MATERIAL', 'FIXTURE');
CREATE TYPE "studioflow"."sf_schedule_option_status" AS ENUM ('DRAFT', 'APPROVED', 'NOT_USED');

CREATE TABLE "studioflow"."sf_schedule_prefix" (
  "id" TEXT NOT NULL,
  "section" "studioflow"."sf_schedule_section" NOT NULL,
  "category" TEXT NOT NULL,
  "category_key" TEXT NOT NULL,
  "prefix" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sf_schedule_prefix_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sf_schedule_prefix_section_category_key_key"
  ON "studioflow"."sf_schedule_prefix"("section", "category_key");

CREATE TABLE "studioflow"."sf_schedule_template_category" (
  "id" TEXT NOT NULL,
  "section" "studioflow"."sf_schedule_section" NOT NULL,
  "category" TEXT NOT NULL,
  "category_key" TEXT NOT NULL,
  "is_default_entry" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sf_schedule_template_category_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sf_schedule_template_category_section_category_key_key"
  ON "studioflow"."sf_schedule_template_category"("section", "category_key");
CREATE INDEX "sf_schedule_template_category_section_is_active_sort_order_idx"
  ON "studioflow"."sf_schedule_template_category"("section", "is_active", "sort_order");

CREATE TABLE "studioflow"."sf_schedule_template_item" (
  "id" TEXT NOT NULL,
  "template_category_id" TEXT,
  "section" "studioflow"."sf_schedule_section" NOT NULL,
  "category" TEXT NOT NULL,
  "category_key" TEXT NOT NULL,
  "brand_id" TEXT,
  "brand_name" TEXT,
  "product_name" TEXT NOT NULL,
  "sku_text" TEXT,
  "color" TEXT,
  "finishing" TEXT,
  "dimension" TEXT,
  "notes" TEXT,
  "image_key" TEXT,
  "qty" DECIMAL(12,2),
  "unit" TEXT,
  "location" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sf_schedule_template_item_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sf_schedule_template_item_section_category_key_is_active_so_idx"
  ON "studioflow"."sf_schedule_template_item"("section", "category_key", "is_active", "sort_order");
ALTER TABLE "studioflow"."sf_schedule_template_item" ADD CONSTRAINT "sf_schedule_template_item_template_category_id_fkey"
  FOREIGN KEY ("template_category_id") REFERENCES "studioflow"."sf_schedule_template_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "studioflow"."sf_schedule_entry" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "section" "studioflow"."sf_schedule_section" NOT NULL,
  "category" TEXT NOT NULL,
  "category_key" TEXT NOT NULL,
  "prefix" TEXT NOT NULL,
  "increment" INTEGER NOT NULL,
  "sort_order" INTEGER NOT NULL,
  "qty" DECIMAL(12,2),
  "unit" TEXT,
  "location" TEXT,
  "active_index" INTEGER NOT NULL DEFAULT 0,
  "version_locked" BOOLEAN NOT NULL DEFAULT false,
  "template_item_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sf_schedule_entry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sf_schedule_entry_increment_check" CHECK ("increment" > 0),
  CONSTRAINT "sf_schedule_entry_qty_check" CHECK ("qty" IS NULL OR "qty" >= 0)
);
ALTER TABLE "studioflow"."sf_schedule_entry" ADD CONSTRAINT "sf_schedule_entry_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "studioflow"."sf_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "studioflow"."sf_schedule_entry" ADD CONSTRAINT "sf_schedule_entry_template_item_id_fkey"
  FOREIGN KEY ("template_item_id") REFERENCES "studioflow"."sf_schedule_template_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "sf_schedule_entry_code_key"
  ON "studioflow"."sf_schedule_entry"("project_id", "section", "prefix", "increment");
CREATE INDEX "sf_schedule_entry_project_id_section_category_key_sort_orde_idx"
  ON "studioflow"."sf_schedule_entry"("project_id", "section", "category_key", "sort_order");
CREATE INDEX "sf_schedule_entry_template_item_id_idx"
  ON "studioflow"."sf_schedule_entry"("template_item_id");

CREATE TABLE "studioflow"."sf_schedule_option" (
  "id" TEXT NOT NULL,
  "entry_id" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "is_final" BOOLEAN NOT NULL DEFAULT false,
  "status" "studioflow"."sf_schedule_option_status" NOT NULL DEFAULT 'DRAFT',
  "brand_id" TEXT,
  "brand_name" TEXT,
  "product_name" TEXT NOT NULL,
  "sku_text" TEXT,
  "color" TEXT,
  "finishing" TEXT,
  "dimension" TEXT,
  "notes" TEXT,
  "image_key" TEXT,
  "search_key" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sf_schedule_option_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "studioflow"."sf_schedule_option" ADD CONSTRAINT "sf_schedule_option_entry_id_fkey"
  FOREIGN KEY ("entry_id") REFERENCES "studioflow"."sf_schedule_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "sf_schedule_option_entry_id_label_key"
  ON "studioflow"."sf_schedule_option"("entry_id", "label");
CREATE UNIQUE INDEX "sf_schedule_one_final_option_per_entry"
  ON "studioflow"."sf_schedule_option"("entry_id") WHERE "is_final" = true;
CREATE INDEX "sf_schedule_option_search_key_idx"
  ON "studioflow"."sf_schedule_option"("search_key");
