CREATE TABLE "studioflow"."sf_book_todo" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "assignee_id" TEXT,
  "due_date" DATE,
  "done_at" TIMESTAMP(3),
  "source_card_id" TEXT,
  "created_by_id" TEXT NOT NULL,
  "created_by_name" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "sf_book_todo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sf_book_todo_project_id_done_at_sort_order_idx" ON "studioflow"."sf_book_todo"("project_id", "done_at", "sort_order");
CREATE INDEX "sf_book_todo_assignee_id_done_at_idx" ON "studioflow"."sf_book_todo"("assignee_id", "done_at");

ALTER TABLE "studioflow"."sf_book_todo" ADD CONSTRAINT "sf_book_todo_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "studioflow"."sf_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "studioflow"."sf_book_todo" ADD CONSTRAINT "sf_book_todo_source_card_id_fkey"
  FOREIGN KEY ("source_card_id") REFERENCES "studioflow"."sf_workspace_card"("id") ON DELETE SET NULL ON UPDATE CASCADE;
