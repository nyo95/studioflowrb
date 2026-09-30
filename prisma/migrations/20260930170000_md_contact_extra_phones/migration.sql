-- A contact can have up to three phone numbers: the first stays in "phone", the other two go here.
ALTER TABLE "master_data"."VendorContact" ADD COLUMN "extra_phones" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
