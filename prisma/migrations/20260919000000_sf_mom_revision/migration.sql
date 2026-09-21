-- MOM revision history: bounded frozen snapshots per document. Additive.

CREATE TABLE "studioflow"."sf_mom_revision" (
  "id" TEXT NOT NULL,
  "document_id" TEXT NOT NULL,
  "number" INTEGER NOT NULL,
  "note" TEXT,
  "snapshot" JSONB NOT NULL,
  "created_by_id" TEXT NOT NULL,
  "created_by_name" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sf_mom_revision_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sf_mom_revision_document_id_number_key" ON "studioflow"."sf_mom_revision"("document_id", "number");
ALTER TABLE "studioflow"."sf_mom_revision" ADD CONSTRAINT "sf_mom_revision_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "studioflow"."sf_mom_document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
