-- A Work Item's specification: what a contractor BOQ shows under the description and prints for the client.
ALTER TABLE "bq"."bq_item" ADD COLUMN "specification" TEXT;
