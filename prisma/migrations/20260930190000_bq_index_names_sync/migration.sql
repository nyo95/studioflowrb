-- Brings the BQ index names in line with the schema after the sibling-order uniqueness migration (prisma migrate diff was not empty).
DROP INDEX "bq"."bq_assembly_line_assembly_template_id_sort_order_idx";
DROP INDEX "bq"."bq_section_project_id_sort_order_idx";
DROP INDEX "bq"."bq_sub_object_item_id_sort_order_idx";
DROP INDEX "bq"."bq_subsection_section_id_sort_order_idx";
DROP INDEX "bq"."bq_template_recommendation_template_section_id_idx";
ALTER INDEX "bq"."BqAssemblyLine_assembly_template_id_sort_order_key" RENAME TO "bq_assembly_line_assembly_template_id_sort_order_key";
ALTER INDEX "bq"."BqSection_project_id_sort_order_key" RENAME TO "bq_section_project_id_sort_order_key";
ALTER INDEX "bq"."BqSubObject_item_id_sort_order_key" RENAME TO "bq_sub_object_item_id_sort_order_key";
ALTER INDEX "bq"."BqSubsection_section_id_sort_order_key" RENAME TO "bq_subsection_section_id_sort_order_key";
ALTER INDEX "bq"."BqTemplateRecommendation_template_section_id_sort_order_key" RENAME TO "bq_template_recommendation_template_section_id_sort_order_key";
