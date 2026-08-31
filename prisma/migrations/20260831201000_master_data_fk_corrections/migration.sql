-- Pricing contract: removing a BrandLink clears provenance but preserves price.
ALTER TABLE "master_data"."PriceMaterial" DROP CONSTRAINT "PriceMaterial_source_link_id_fkey";
ALTER TABLE "master_data"."PriceMaterial"
  ADD CONSTRAINT "PriceMaterial_source_link_id_fkey"
  FOREIGN KEY ("source_link_id") REFERENCES "master_data"."BrandLink"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
