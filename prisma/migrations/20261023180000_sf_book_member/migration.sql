CREATE TABLE "studioflow"."sf_book_member" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "invited_by_id" TEXT NOT NULL,
  "invited_by_name" TEXT NOT NULL,
  "invited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sf_book_member_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sf_book_member_project_id_user_id_key" ON "studioflow"."sf_book_member"("project_id", "user_id");
CREATE INDEX "sf_book_member_user_id_idx" ON "studioflow"."sf_book_member"("user_id");

ALTER TABLE "studioflow"."sf_book_member" ADD CONSTRAINT "sf_book_member_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "studioflow"."sf_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
