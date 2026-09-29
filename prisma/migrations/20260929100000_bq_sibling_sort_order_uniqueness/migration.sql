-- A sibling list is ordered data, not a best-effort display hint. These
-- indexes make concurrent MAX(sort_order)+1 inserts fail safely instead of
-- persisting two siblings with the same position. Nullable dual-parent scopes
-- need partial indexes because PostgreSQL treats NULLs as distinct in a normal
-- unique index.

CREATE UNIQUE INDEX "bq_template_section_root_sort_order_key"
  ON "bq"."bq_template_section"("template_id", "sort_order")
  WHERE "parent_id" IS NULL;
CREATE UNIQUE INDEX "bq_template_section_child_sort_order_key"
  ON "bq"."bq_template_section"("parent_id", "sort_order")
  WHERE "parent_id" IS NOT NULL;

CREATE UNIQUE INDEX "bq_item_section_sort_order_key"
  ON "bq"."bq_item"("section_id", "sort_order")
  WHERE "section_id" IS NOT NULL;
CREATE UNIQUE INDEX "bq_item_subsection_sort_order_key"
  ON "bq"."bq_item"("subsection_id", "sort_order")
  WHERE "subsection_id" IS NOT NULL;

CREATE UNIQUE INDEX "bq_line_item_sub_object_sort_order_key"
  ON "bq"."bq_line_item"("sub_object_id", "sort_order")
  WHERE "sub_object_id" IS NOT NULL;
CREATE UNIQUE INDEX "bq_line_item_item_sort_order_key"
  ON "bq"."bq_line_item"("item_id", "sort_order")
  WHERE "item_id" IS NOT NULL;

CREATE UNIQUE INDEX "BqTemplateRecommendation_template_section_id_sort_order_key"
  ON "bq"."bq_template_recommendation"("template_section_id", "sort_order");
CREATE UNIQUE INDEX "BqAssemblyLine_assembly_template_id_sort_order_key"
  ON "bq"."bq_assembly_line"("assembly_template_id", "sort_order");
CREATE UNIQUE INDEX "BqSection_project_id_sort_order_key"
  ON "bq"."bq_section"("project_id", "sort_order");
CREATE UNIQUE INDEX "BqSubsection_section_id_sort_order_key"
  ON "bq"."bq_subsection"("section_id", "sort_order");
CREATE UNIQUE INDEX "BqSubObject_item_id_sort_order_key"
  ON "bq"."bq_sub_object"("item_id", "sort_order");
