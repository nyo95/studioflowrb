-- Intentionally ordered before the published VendorLink purge. On databases
-- where purge already ran, add the destination fields without fabricating data.
ALTER TABLE "master_data"."Vendor"
  ADD COLUMN "info_links" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "link_review_snapshot" JSONB NOT NULL DEFAULT '[]';

DO $$
BEGIN
  IF to_regclass('master_data."VendorLink"') IS NOT NULL THEN
    -- Company/contact channels are Supplier information, never catalog ownership.
    -- Retain complete original metadata. Ambiguous resource links are held for
    -- owner review rather than guessed into a Brand or silently discarded.
    UPDATE "master_data"."Vendor" v SET
      "info_links" = COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.sort_order, l.id)
        FROM "master_data"."VendorLink" l WHERE l.vendor_id = v.id
        AND upper(l.kind) IN ('WEBSITE','INSTAGRAM','FACEBOOK','TIKTOK','YOUTUBE','LINKEDIN','WHATSAPP')), '[]'),
      "link_review_snapshot" = COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.sort_order, l.id)
        FROM "master_data"."VendorLink" l WHERE l.vendor_id = v.id
        AND upper(l.kind) NOT IN ('WEBSITE','INSTAGRAM','FACEBOOK','TIKTOK','YOUTUBE','LINKEDIN','WHATSAPP')), '[]');
  END IF;
END $$;
