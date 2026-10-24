CREATE TABLE "studioflow"."sf_book_feedback_point" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "iteration_id" TEXT NOT NULL,
  "card_id" TEXT,
  "body" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "handled_at" TIMESTAMP(3),
  "handled_by_id" TEXT,
  "handled_by_name" TEXT,
  "created_by_id" TEXT NOT NULL,
  "created_by_name" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "sf_book_feedback_point_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sf_book_feedback_point_project_id_iteration_id_sort_order_idx" ON "studioflow"."sf_book_feedback_point"("project_id", "iteration_id", "sort_order");

ALTER TABLE "studioflow"."sf_book_feedback_point" ADD CONSTRAINT "sf_book_feedback_point_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "studioflow"."sf_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "studioflow"."sf_book_feedback_point" ADD CONSTRAINT "sf_book_feedback_point_iteration_id_fkey"
  FOREIGN KEY ("iteration_id") REFERENCES "studioflow"."sf_revision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "studioflow"."sf_book_feedback_point" ADD CONSTRAINT "sf_book_feedback_point_card_id_fkey"
  FOREIGN KEY ("card_id") REFERENCES "studioflow"."sf_workspace_card"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "studioflow"."sf_book_todo" ADD COLUMN "feedback_point_id" TEXT;
CREATE UNIQUE INDEX "sf_book_todo_feedback_point_id_key" ON "studioflow"."sf_book_todo"("feedback_point_id");
ALTER TABLE "studioflow"."sf_book_todo" ADD CONSTRAINT "sf_book_todo_feedback_point_id_fkey"
  FOREIGN KEY ("feedback_point_id") REFERENCES "studioflow"."sf_book_feedback_point"("id") ON DELETE SET NULL ON UPDATE CASCADE;
