-- R4.68: keep the stable STORE code and material capability; update its display name.
UPDATE "master_data"."VendorType"
SET "name" = 'Retail', "updated_at" = now()
WHERE "code" = 'STORE';
